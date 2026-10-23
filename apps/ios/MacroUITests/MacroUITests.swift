import XCTest

@MainActor
final class MacroUITests: XCTestCase {
    func testTypedLogCorrectionUndoAndNavigation() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting"]
        app.launch()
        XCTAssertTrue(app.buttons["typeMeal"].waitForExistence(timeout: 15))
        attach(app, "Home empty")
        app.buttons["typeMeal"].tap()
        let description = app.textViews["mealDescription"]
        XCTAssertTrue(description.waitForExistence(timeout: 5))
        description.tap()
        description.typeText("I ate a banana and Greek yogurt")
        submitMeal(app)
        let card = app.buttons["mealCard"].firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["dailyCalories"].label.contains("205"))
        app.buttons["Dismiss"].firstMatch.tap()
        card.tap()
        attach(app, "Expanded meal")
        app.buttons["correctMeal"].tap()
        let correction = app.textViews["mealDescription"]
        XCTAssertTrue(correction.waitForExistence(timeout: 5))
        correction.tap()
        correction.typeText("Actually half of that")
        submitMeal(app)
        XCTAssertTrue(app.buttons["undoChange"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["dailyCalories"].label.contains("102"))
        app.buttons["undoChange"].tap()
        XCTAssertTrue(app.staticTexts["dailyCalories"].label.contains("205"))
        app.tabBars.buttons["Progress"].tap()
        XCTAssertTrue(app.staticTexts["Calories"].waitForExistence(timeout: 5))
        attach(app, "Progress")
        app.tabBars.buttons["Profile"].tap()
        XCTAssertTrue(app.buttons["targetCalories"].waitForExistence(timeout: 5))
        attach(app, "Profile")
        app.buttons["targetCalories"].tap()
        XCTAssertTrue(app.buttons["saveGoals"].waitForExistence(timeout: 5))
        app.buttons["Cancel"].tap()
    }

    func testManualMealEditDeleteAndGoalSave() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting"]
        app.launch()
        XCTAssertTrue(app.buttons["addManually"].waitForExistence(timeout: 15))
        app.buttons["addManually"].tap()
        let name = app.textFields["foodName0"]
        XCTAssertTrue(name.waitForExistence(timeout: 5))
        name.tap()
        name.typeText("Toast")
        replace(app.textFields["foodCalories0"], with: "200")
        app.buttons["saveManualMeal"].tap()
        XCTAssertTrue(app.buttons["mealCard"].firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["dailyCalories"].label.contains("200"))
        app.buttons["Dismiss"].firstMatch.tap()
        app.buttons["mealCard"].firstMatch.tap()
        app.buttons["editMeal"].tap()
        XCTAssertTrue(app.buttons["saveManualMeal"].waitForExistence(timeout: 5))
        replace(app.textFields["foodCalories0"], with: "300")
        app.buttons["saveManualMeal"].tap()
        XCTAssertTrue(app.buttons["undoChange"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["dailyCalories"].label.contains("300"))
        app.buttons["Dismiss"].firstMatch.tap()
        app.buttons["deleteMeal"].tap()
        app.buttons["Delete meal"].tap()
        XCTAssertTrue(app.staticTexts["No meals logged"].waitForExistence(timeout: 5))
        app.buttons["undoChange"].tap()
        XCTAssertTrue(app.buttons["mealCard"].firstMatch.waitForExistence(timeout: 5))
        app.tabBars.buttons["Profile"].tap()
        app.buttons["targetCalories"].tap()
        XCTAssertTrue(app.buttons["saveGoals"].waitForExistence(timeout: 5))
        replace(app.textFields["goalCalories"], with: "2400")
        app.buttons["saveGoals"].tap()
        XCTAssertTrue(app.buttons["targetCalories"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["targetCalories"].label.contains("2,400"))
    }

    func testLiveAIFromNativeApp() throws {
        guard ProcessInfo.processInfo.environment["MACRO_TEST_LIVE_AI"] == "1" else {
            throw XCTSkip("Opt in with MACRO_TEST_LIVE_AI=1; this test makes a real API request.")
        }
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--live-ai"]
        app.launch()
        XCTAssertTrue(app.buttons["typeMeal"].waitForExistence(timeout: 15))
        app.buttons["typeMeal"].tap()
        let text = app.textViews["mealDescription"]
        XCTAssertTrue(text.waitForExistence(timeout: 5))
        text.tap()
        text.typeText("I ate one medium banana and 170 grams plain nonfat Greek yogurt.")
        submitMeal(app)
        XCTAssertTrue(app.buttons["mealCard"].firstMatch.waitForExistence(timeout: 180))
        XCTAssertFalse(app.staticTexts["dailyCalories"].label.hasPrefix("0 "))
        app.buttons["Dismiss"].firstMatch.tap()
        app.buttons["mealCard"].firstMatch.tap()
        attach(app, "Live OpenAI meal")
        app.buttons["correctMeal"].tap()
        let correction = app.textViews["mealDescription"]
        XCTAssertTrue(correction.waitForExistence(timeout: 5))
        correction.tap()
        correction.typeText("Correction: I only ate half of each food in this meal. Keep everything else unchanged.")
        submitMeal(app)
        XCTAssertTrue(app.buttons["undoChange"].waitForExistence(timeout: 180))
        XCTAssertEqual(app.buttons.matching(identifier: "mealCard").count, 1)
        attach(app, "Live OpenAI correction")
    }

    func testHostedConnectionSettings() throws {
        guard ProcessInfo.processInfo.environment["MACRO_TEST_LIVE_AI"] == "1" else {
            throw XCTSkip("Opt in after provisioning the hosted verification credential.")
        }
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--live-ai"]
        app.launch()
        XCTAssertTrue(app.buttons["typeMeal"].waitForExistence(timeout: 15))
        app.tabBars.buttons["Profile"].tap()
        app.buttons["apiConnection"].tap()
        XCTAssertTrue(app.textFields["API URL"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.textFields["API URL"].value as? String, "https://macro-voice-api-production.up.railway.app")
        app.buttons["Check connection"].tap()
        XCTAssertTrue(app.staticTexts["Connected"].waitForExistence(timeout: 30))
        attach(app, "Hosted API connection")
        app.buttons["Cancel"].tap()
    }

    func testLargeTypeNavigation() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        XCTAssertTrue(app.buttons["typeMeal"].waitForExistence(timeout: 15))
        attach(app, "Large type Home")
        app.tabBars.buttons["Profile"].tap()
        XCTAssertTrue(app.buttons["targetCalories"].waitForExistence(timeout: 5))
        attach(app, "Large type Profile")
        app.buttons["targetCalories"].tap()
        XCTAssertTrue(app.buttons["saveGoals"].waitForExistence(timeout: 5))
        app.buttons["Cancel"].tap()
    }

    func testPhysicalRecordingSheetProducesUsableAudio() throws {
        guard ProcessInfo.processInfo.environment["MACRO_TEST_AUDIO"] == "1" else {
            throw XCTSkip("Opt in with MACRO_TEST_AUDIO=1 for a four-second microphone check; no audio is uploaded.")
        }
        let app = XCUIApplication()
        app.launchArguments = ["--uitesting"]
        app.launch()
        XCTAssertTrue(app.buttons["typeMeal"].waitForExistence(timeout: 15))
        app.buttons["typeMeal"].tap()
        XCTAssertTrue(app.buttons["recordMeal"].waitForExistence(timeout: 5))
        app.buttons["recordMeal"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["recordingInput"].waitForExistence(timeout: 5))
        Thread.sleep(forTimeInterval: 4)
        attach(app, "Microphone recording")
        app.buttons["sendMeal"].tap()
        XCTAssertTrue(app.buttons["mealCard"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["dailyCalories"].label.contains("205"))
    }

    private func submitMeal(_ app: XCUIApplication) {
        let button = app.buttons["sendMeal"]
        XCTAssertTrue(button.isHittable)
        // The default activation point can miss this keyboard-resized sheet.
        button.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    }

    private func replace(_ field: XCUIElement, with text: String) {
        field.tap()
        let current = field.value as? String ?? ""
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count) + text)
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
