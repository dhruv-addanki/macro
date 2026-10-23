require 'xcodeproj'
require 'fileutils'

root = File.expand_path(ARGV[0] || '../apps/ios', __dir__)
project = Xcodeproj::Project.new(File.join(root, 'Macro.xcodeproj'))
project.root_object.attributes['LastUpgradeCheck'] = '2710'

config_group = project.main_group.new_group('Config', 'Config')
debug = config_group.new_file('Debug.xcconfig')
release = config_group.new_file('Release.xcconfig')
config_group.new_file('Info.plist')

def sources(project, target, directory, root)
  group = project.main_group.new_group(directory, directory)
  Dir.glob(File.join(root, directory, '**/*.swift')).sort.each do |path|
    reference = group.new_file(path.delete_prefix(File.join(root, directory) + '/'))
    target.source_build_phase.add_file_reference(reference)
  end
end

app = project.new_target(:application, 'Macro', :ios, '26.0')
tests = project.new_target(:unit_test_bundle, 'MacroTests', :ios, '26.0')
ui = project.new_target(:ui_test_bundle, 'MacroUITests', :ios, '26.0')
tests.add_dependency(app)
ui.add_dependency(app)
sources(project, app, 'Macro', root)
sources(project, tests, 'MacroTests', root)
sources(project, ui, 'MacroUITests', root)
asset_path = File.join(root, 'Macro/Assets.xcassets')
if File.exist?(asset_path)
  reference = project.main_group.new_file('Macro/Assets.xcassets')
  app.resources_build_phase.add_file_reference(reference)
end

[app, tests, ui].each do |target|
  target.build_configurations.each do |config|
    config.base_configuration_reference = config.name == 'Debug' ? debug : release
    settings = config.build_settings
    settings['SWIFT_VERSION'] = '6.0'
    settings['IPHONEOS_DEPLOYMENT_TARGET'] = '26.0'
    settings['TARGETED_DEVICE_FAMILY'] = '1'
    settings['CODE_SIGN_STYLE'] = 'Automatic'
    settings['DEVELOPMENT_TEAM'] = '$(MACRO_DEVELOPMENT_TEAM)'
    settings['SWIFT_EMIT_LOC_STRINGS'] = 'YES'
    settings['GENERATE_INFOPLIST_FILE'] = 'YES'
    settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'YES'
    settings['SWIFT_STRICT_CONCURRENCY'] = 'complete'
    settings['PRODUCT_BUNDLE_IDENTIFIER'] = "$(MACRO_BUNDLE_ID)#{target == app ? '' : '.' + target.name}"
  end
end
app.build_configurations.each do |config|
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'NO'
  config.build_settings['INFOPLIST_FILE'] = 'Config/Info.plist'
  config.build_settings['MARKETING_VERSION'] = '0.1.0'
  config.build_settings['CURRENT_PROJECT_VERSION'] = '1'
  config.build_settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon' if File.exist?(asset_path)
end
tests.build_configurations.each do |config|
  config.build_settings['TEST_HOST'] = '$(BUILT_PRODUCTS_DIR)/Macro.app/Macro'
  config.build_settings['BUNDLE_LOADER'] = '$(TEST_HOST)'
end
ui.build_configurations.each { |config| config.build_settings['TEST_TARGET_NAME'] = 'Macro' }
project.save
scheme = Xcodeproj::XCScheme.new
scheme.configure_with_targets(app, tests)
scheme.launch_action.buildable_product_runnable = Xcodeproj::XCScheme::BuildableProductRunnable.new(app, 0)
scheme.profile_action.buildable_product_runnable = Xcodeproj::XCScheme::BuildableProductRunnable.new(app, 0)
scheme.add_test_target(ui)
scheme.test_action.environment_variables = Xcodeproj::XCScheme::EnvironmentVariables.new([
  { :key => 'MACRO_TEST_AUDIO', :value => '$(MACRO_TEST_AUDIO)', :enabled => true },
  { :key => 'MACRO_TEST_HOSTED_API', :value => '$(MACRO_TEST_HOSTED_API)', :enabled => true },
  { :key => 'MACRO_TEST_LIVE_AI', :value => '$(MACRO_TEST_LIVE_AI)', :enabled => true }
])
scheme.test_action.xml_element.attributes['shouldUseLaunchSchemeArgsEnv'] = 'NO'
scheme.test_action.add_macro_expansion(Xcodeproj::XCScheme::MacroExpansion.new(app))
scheme.save_as(File.join(root, 'Macro.xcodeproj'), 'Macro', true)
puts 'Generated apps/ios/Macro.xcodeproj'
