import Foundation
import AVFAudio
import Observation

@MainActor @Observable
final class AudioRecorder {
    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private var interruptionTask: Task<Void, Never>?
    private(set) var isRecording = false
    private(set) var duration: TimeInterval = 0
    private(set) var levels: [Double] = Array(repeating: 0.08, count: 32)
    private(set) var fileURL: URL?
    private(set) var inputName = "Microphone"
    var errorMessage: String?

    func start() async throws {
        let allowed = await AVAudioApplication.requestRecordPermission()
        try Task.checkCancellation()
        guard allowed else { throw AIError.message("Microphone access is off. Enable it in Settings, or type your meal instead.") }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .default)
        try session.setActive(true)
        var captureStarted = false
        defer { if !captureStarted { try? session.setActive(false) } }
        guard session.isInputAvailable, !session.currentRoute.inputs.isEmpty else {
            try? session.setActive(false)
            throw AIError.message("No microphone input is available. Check the connected microphone and record again.")
        }
        guard !AVAudioApplication.shared.isInputMuted else {
            try? session.setActive(false)
            throw AIError.message("Microphone input is muted. Unmute Macro in Control Center and record again.")
        }
        inputName = session.currentRoute.inputs.map(\.portName).joined(separator: ", ")
        let folder = URL.applicationSupportDirectory.appendingPathComponent("Recordings", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let url = folder.appendingPathComponent("\(UUID().uuidString).m4a")
        let recorder = try AVAudioRecorder(url: url, settings: [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 22050,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue
        ])
        guard recorder.prepareToRecord(), recorder.record(forDuration: 120) else { throw AIError.message("The microphone could not start. You can still type your meal.") }
        recorder.isMeteringEnabled = true
        self.recorder = recorder
        captureStarted = true
        fileURL = url
        duration = 0
        errorMessage = nil
        levels = Array(repeating: 0.04, count: 32)
        isRecording = true
        let timer = Timer(timeInterval: 0.12, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        self.timer = timer
        RunLoop.main.add(timer, forMode: .common)
        interruptionTask?.cancel()
        interruptionTask = Task { [weak self] in
            for await notification in NotificationCenter.default.notifications(named: AVAudioSession.interruptionNotification) {
                guard !Task.isCancelled else { return }
                guard Self.shouldStop(for: notification) else { continue }
                self?.stop()
                self?.errorMessage = "Recording was interrupted. Send the captured audio or record again."
            }
        }
    }

    private func tick() {
        guard let recorder else { return }
        if AVAudioApplication.shared.isInputMuted {
            stop()
            errorMessage = "Microphone input was muted. Unmute Macro in Control Center and record again."
            return
        }
        duration = recorder.currentTime
        recorder.updateMeters()
        levels.removeFirst()
        levels.append(Self.waveformLevel(for: Double(recorder.peakPower(forChannel: 0))))
        if !recorder.isRecording { stop() }
    }

    static func waveformLevel(for powerDB: Double) -> Double {
        guard powerDB.isFinite else { return 0.04 }
        return max(0.04, min(1, (powerDB + 70) / 60))
    }

    static func shouldStop(for notification: Notification) -> Bool {
        let type = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
        return type == AVAudioSession.InterruptionType.began.rawValue
    }

    func stop() {
        let hadRecorder = recorder != nil
        if let recorder, recorder.isRecording { duration = max(duration, recorder.currentTime) }
        recorder?.stop()
        recorder = nil
        timer?.invalidate()
        timer = nil
        isRecording = false
        interruptionTask?.cancel()
        interruptionTask = nil
        if hadRecorder { try? AVAudioSession.sharedInstance().setActive(false) }
    }

    func discard() {
        stop()
        if let fileURL { try? FileManager.default.removeItem(at: fileURL) }
        fileURL = nil
        duration = 0
    }
}

struct RecordingAnalysis: Sendable {
    var duration: TimeInterval
    var peak: Float

    static func inspect(_ url: URL) throws -> RecordingAnalysis {
        let file: AVAudioFile
        do { file = try AVAudioFile(forReading: url) }
        catch { throw AIError.message("The recording could not be read. Record it again, or type your meal.") }
        let rate = file.processingFormat.sampleRate
        guard rate.isFinite, rate > 0 else { throw AIError.message("The recording has an invalid audio format. Record it again.") }
        let duration = Double(file.length) / rate
        guard duration >= 0.35 else { throw AIError.message("The recording is too short to transcribe. Record your meal again before sending.") }
        guard duration <= 125 else { throw AIError.message("The recording is too long. Record a description under two minutes.") }
        guard let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: 4096) else {
            throw AIError.message("The recording could not be decoded. Record it again.")
        }
        var peak: Float = 0
        while file.framePosition < file.length {
            try file.read(into: buffer)
            guard buffer.frameLength > 0 else { throw AIError.message("The recording is incomplete. Record it again.") }
            guard let channels = buffer.floatChannelData else { throw AIError.message("The recording could not be decoded. Record it again.") }
            for channel in 0..<Int(buffer.format.channelCount) {
                for index in 0..<Int(buffer.frameLength) { peak = max(peak, abs(channels[channel][index])) }
            }
        }
        guard peak > 0.0000001 else {
            throw AIError.message("No microphone audio was captured. Check the microphone input and record again. Nothing has been uploaded.")
        }
        return RecordingAnalysis(duration: duration, peak: peak)
    }
}
