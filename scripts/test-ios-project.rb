require 'xcodeproj'
require 'minitest/autorun'
require 'open3'
require 'tmpdir'
require 'rbconfig'

class IOSProjectTest < Minitest::Test
  ROOT = File.expand_path('../apps/ios', __dir__)

  def assert_runnable(root, action)
    path = File.join(root, 'Macro.xcodeproj/xcshareddata/xcschemes/Macro.xcscheme')
    xpath = lambda do |expression|
      value, error, status = Open3.capture3('xmllint', '--xpath', expression, path)
      assert status.success?, error
      value.strip
    end
    runnable = "Scheme/#{action}/BuildableProductRunnable"
    assert_equal '1', xpath.call("count(#{runnable})"), "#{action} must launch Macro.app, not just build it"
    reference = "#{runnable}/BuildableReference"
    app = Xcodeproj::Project.open(File.join(root, 'Macro.xcodeproj')).targets.find { |target| target.name == 'Macro' }
    assert_equal app.uuid, xpath.call("string(#{reference}/@BlueprintIdentifier)")
    assert_equal 'Macro.app', xpath.call("string(#{reference}/@BuildableName)")
    assert_equal '0', xpath.call("string(#{runnable}/@runnableDebuggingMode)")
  end

  def test_run_launches_the_app
    assert_runnable(ROOT, 'LaunchAction')
  end

  def test_profile_launches_the_app
    assert_runnable(ROOT, 'ProfileAction')
  end

  def test_regeneration_preserves_runnable_actions
    Dir.mktmpdir('macro-project-test') do |root|
      output, error, status = Open3.capture3(RbConfig.ruby, File.join(__dir__, 'generate-ios-project.rb'), root)
      assert status.success?, "#{output}\n#{error}"
      assert_runnable(root, 'LaunchAction')
      assert_runnable(root, 'ProfileAction')
    end
  end
end
