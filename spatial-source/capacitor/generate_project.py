#!/usr/bin/env python3
"""Generate the Capacitor host project. Run: python3 capacitor/generate_project.py
No network packages, signing credentials, or backend resources are created.
"""
from pathlib import Path
import hashlib
import plistlib

root = Path(__file__).resolve().parent / 'ios'
root.mkdir(parents=True, exist_ok=True)
project = root / 'AuxiliumSpatial.xcodeproj'
project.mkdir(exist_ok=True)

def ident(name):
    return hashlib.sha256(name.encode()).hexdigest()[:24].upper()
def q(text):
    return '"' + text.replace('\\', '\\\\').replace('"', '\\"') + '"'
def arr(values):
    return '(' + ', '.join(values) + ',)'
objects = []
def obj(name, content):
    objects.append(f'\t\t{ident(name)} = {{ {content} }};')
    return ident(name)

app_sources = sorted((root / 'App').glob('*.swift'))
app_sources += [root.parent.parent / 'ios/SpatialApp' / name for name in ['CaptureController.swift', 'CapturePipeline.swift', 'AppleSurfaceAdapter.swift', 'DeviceAccessGate.swift']]
test_sources = [root.parent.parent / 'tests/native/ConnectedCaptureTests.swift'] + sorted((root.parent.parent / 'tests/capacitor').glob('*.swift'))
app_refs, app_builds, test_refs, test_builds = [], [], [], []
for sources, refs, builds, prefix in [(app_sources, app_refs, app_builds, 'app'), (test_sources, test_refs, test_builds, 'test')]:
    for source in sources:
        path = __import__('os').path.relpath(source, root)
        ref = obj(prefix + 'ref' + path, f'isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {q(path)}; sourceTree = SOURCE_ROOT;')
        build = obj(prefix + 'build' + path, f'isa = PBXBuildFile; fileRef = {ref};')
        refs.append(ref); builds.append(build)
app_product = obj('app-product', 'isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = AuxiliumSpatial.app; sourceTree = BUILT_PRODUCTS_DIR;')
test_product = obj('test-product', 'isa = PBXFileReference; explicitFileType = wrapper.cfbundle; includeInIndex = 0; path = AuxiliumSpatialTests.xctest; sourceTree = BUILT_PRODUCTS_DIR;')
privacy_ref = obj('privacy-ref', 'isa = PBXFileReference; lastKnownFileType = text.xml; path = ../../ios/SpatialApp/PrivacyInfo.xcprivacy; sourceTree = SOURCE_ROOT;')
privacy_build = obj('privacy-build', f'isa = PBXBuildFile; fileRef = {privacy_ref};')
package_refs, product_deps, package_builds, test_package_builds = [], [], [], []
for package in ['SpatialCore', 'CaptureKit', 'SpatialPersistence', 'SpatialInterop']:
    ref = obj('package' + package, f'isa = XCLocalSwiftPackageReference; relativePath = {q("../../packages/" + package)};')
    dep = obj('dependency' + package, f'isa = XCSwiftPackageProductDependency; package = {ref}; productName = {package};')
    build = obj('framework' + package, f'isa = PBXBuildFile; productRef = {dep};')
    package_refs.append(ref); product_deps.append(dep); package_builds.append(build)
    test_package_builds.append(obj("test-framework" + package, f"isa = PBXBuildFile; productRef = {dep};"))
cap_ref = obj('capacitor-package', 'isa = XCRemoteSwiftPackageReference; repositoryURL = "https://github.com/ionic-team/capacitor-swift-pm.git"; requirement = { kind = exactVersion; version = 8.5.3; };')
package_refs.append(cap_ref)
for name in ['Capacitor', 'Cordova']:
    dep = obj('dependency' + name, f'isa = XCSwiftPackageProductDependency; package = {cap_ref}; productName = {name};')
    product_deps.append(dep)
    package_builds.append(obj('framework' + name, f'isa = PBXBuildFile; productRef = {dep};'))
    test_package_builds.append(obj('test-framework' + name, f'isa = PBXBuildFile; productRef = {dep};'))
web_ref = obj('web-assets', 'isa = PBXFileReference; lastKnownFileType = folder; path = App/public; sourceTree = SOURCE_ROOT;')
config_ref = obj('capacitor-config', 'isa = PBXFileReference; lastKnownFileType = text.json; path = App/capacitor.config.json; sourceTree = SOURCE_ROOT;')
web_build = obj('web-build', f'isa = PBXBuildFile; fileRef = {web_ref};')
config_build = obj('config-build', f'isa = PBXBuildFile; fileRef = {config_ref};')
app_refs += [web_ref, config_ref]
obj('main-group', f'isa = PBXGroup; children = {arr([ident("sources-group"), ident("tests-group"), ident("products-group")])}; sourceTree = "<group>";')
obj('sources-group', f'isa = PBXGroup; name = SpatialApp; children = {arr(app_refs + [privacy_ref])}; sourceTree = "<group>";')
obj('tests-group', f'isa = PBXGroup; name = NativeTests; children = {arr(test_refs)}; sourceTree = "<group>";')
obj('products-group', f'isa = PBXGroup; name = Products; children = {arr([app_product, test_product])}; sourceTree = "<group>";')
for prefix, builds in [('app', app_builds), ('test', test_builds)]:
    obj(prefix + '-sources', f'isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = {arr(builds)}; runOnlyForDeploymentPostprocessing = 0;')
    obj(prefix + '-resources', f'isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = {arr([privacy_build, web_build, config_build]) if prefix == "app" else "()"}; runOnlyForDeploymentPostprocessing = 0;')
    obj(prefix + '-frameworks', f'isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = {arr(package_builds if prefix == "app" else test_package_builds)}; runOnlyForDeploymentPostprocessing = 0;')
proxy = obj('test-proxy', f'isa = PBXContainerItemProxy; containerPortal = {ident("project")}; proxyType = 1; remoteGlobalIDString = {ident("app-target")}; remoteInfo = AuxiliumSpatial;')
dependency = obj('test-app-dependency', f'isa = PBXTargetDependency; target = {ident("app-target")}; targetProxy = {proxy};')
for prefix, name, product, ptype in [('app', 'AuxiliumSpatial', app_product, 'com.apple.product-type.application'), ('test', 'AuxiliumSpatialTests', test_product, 'com.apple.product-type.bundle.unit-test')]:
    obj(prefix + '-target', f'isa = PBXNativeTarget; buildConfigurationList = {ident(prefix + "-configs")}; buildPhases = {arr([ident(prefix + "-sources"), ident(prefix + "-frameworks"), ident(prefix + "-resources")])}; buildRules = (); dependencies = {arr([dependency]) if prefix == "test" else "()"}; name = {name}; packageProductDependencies = {arr(product_deps)}; productName = {name}; productReference = {product}; productType = {q(ptype)};')
project_settings = {'CLANG_ENABLE_MODULES':'YES', 'CLANG_ENABLE_OBJC_ARC':'YES', 'IPHONEOS_DEPLOYMENT_TARGET':'17.0', 'SDKROOT':'iphoneos', 'SWIFT_VERSION':'5.0', 'ENABLE_USER_SCRIPT_SANDBOXING':'YES'}
app_settings = {'PRODUCT_NAME':'$(TARGET_NAME)', 'PRODUCT_BUNDLE_IDENTIFIER':'com.auxiliumenvironmental.spatial', 'INFOPLIST_FILE':'App/Info.plist', 'GENERATE_INFOPLIST_FILE':'NO', 'CURRENT_PROJECT_VERSION':'1', 'MARKETING_VERSION':'0.1.0', 'TARGETED_DEVICE_FAMILY':'1', 'SUPPORTED_PLATFORMS':'iphoneos iphonesimulator', 'SUPPORTS_MACCATALYST':'NO', 'SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD':'NO', 'CODE_SIGN_STYLE':'Automatic', 'LD_RUNPATH_SEARCH_PATHS':'$(inherited) @executable_path/Frameworks', 'SWIFT_EMIT_LOC_STRINGS':'YES'}
test_settings = {'PRODUCT_NAME':'$(TARGET_NAME)', 'PRODUCT_BUNDLE_IDENTIFIER':'com.auxiliumenvironmental.spatial.tests', 'GENERATE_INFOPLIST_FILE':'YES', 'TARGETED_DEVICE_FAMILY':'1', 'TEST_HOST':'$(BUILT_PRODUCTS_DIR)/AuxiliumSpatial.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/AuxiliumSpatial', 'BUNDLE_LOADER':'$(TEST_HOST)', 'CODE_SIGN_STYLE':'Automatic', 'LD_RUNPATH_SEARCH_PATHS':'$(inherited) @executable_path/Frameworks @loader_path/Frameworks'}
for prefix, settings in [('project', project_settings), ('app', app_settings), ('test', test_settings)]:
    for mode in ['Debug', 'Release']:
        values = dict(settings)
        if prefix == 'project':
            values.update({'SWIFT_OPTIMIZATION_LEVEL':'-Onone' if mode == 'Debug' else '-O', 'DEBUG_INFORMATION_FORMAT':'dwarf' if mode == 'Debug' else 'dwarf-with-dsym', 'ENABLE_TESTABILITY':'YES' if mode == 'Debug' else 'NO'})
            if mode == 'Debug': values['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = 'DEBUG $(inherited)'
        content = ' '.join(f'{key} = {q(value)};' for key, value in sorted(values.items()))
        obj(prefix + mode, f'isa = XCBuildConfiguration; buildSettings = {{ {content} }}; name = {mode};')
    obj(prefix + '-configs', f'isa = XCConfigurationList; buildConfigurations = {arr([ident(prefix + "Debug"), ident(prefix + "Release")])}; defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
obj('project', f'isa = PBXProject; attributes = {{ BuildIndependentTargetsInParallel = YES; LastUpgradeCheck = 1500; }}; buildConfigurationList = {ident("project-configs")}; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; hasScannedForEncodings = 0; knownRegions = (en, Base,); mainGroup = {ident("main-group")}; packageReferences = {arr(package_refs)}; productRefGroup = {ident("products-group")}; projectDirPath = ""; projectRoot = ""; targets = {arr([ident("app-target"), ident("test-target")])};')
(project / 'project.pbxproj').write_text('// !$*UTF8*$!\n// Generated by python3 capacitor/generate_project.py\n{\n\tarchiveVersion = 1;\n\tclasses = {};\n\tobjectVersion = 56;\n\tobjects = {\n' + '\n'.join(objects) + '\n\t};\n\trootObject = ' + ident('project') + ';\n}\n')
scheme_dir = project / 'xcshareddata/xcschemes'; scheme_dir.mkdir(parents=True, exist_ok=True)
def reference(prefix, buildable):
    return f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{ident(prefix + "-target")}" BuildableName="{buildable}" BlueprintName="AuxiliumSpatial{"Tests" if prefix == "test" else ""}" ReferencedContainer="container:AuxiliumSpatial.xcodeproj"/>'
(scheme_dir / 'AuxiliumSpatial.xcscheme').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1500" version="1.7">
 <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries>
  <BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{reference('app', 'AuxiliumSpatial.app')}</BuildActionEntry>
 </BuildActionEntries></BuildAction>
 <TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO">{reference('test', 'AuxiliumSpatialTests.xctest')}</TestableReference></Testables></TestAction>
 <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="NO"><BuildableProductRunnable runnableDebuggingMode="0">{reference('app', 'AuxiliumSpatial.app')}</BuildableProductRunnable></LaunchAction>
 <ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">{reference('app', 'AuxiliumSpatial.app')}</BuildableProductRunnable></ProfileAction>
 <AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>
''')
info = {'CFBundleDevelopmentRegion':'$(DEVELOPMENT_LANGUAGE)', 'CFBundleDisplayName':'Auxilium Spatial', 'CFBundleExecutable':'$(EXECUTABLE_NAME)', 'CFBundleIdentifier':'$(PRODUCT_BUNDLE_IDENTIFIER)', 'CFBundleInfoDictionaryVersion':'6.0', 'CFBundleName':'$(PRODUCT_NAME)', 'CFBundlePackageType':'APPL', 'CFBundleShortVersionString':'$(MARKETING_VERSION)', 'CFBundleVersion':'$(CURRENT_PROJECT_VERSION)', 'LSRequiresIPhoneOS':True, 'NSCameraUsageDescription':'Auxilium Spatial uses the camera and LiDAR to capture room geometry. Room sources stay on this device unless you explicitly export a layout.', 'UIApplicationSceneManifest':{'UIApplicationSupportsMultipleScenes':False,'UISceneConfigurations':{'UIWindowSceneSessionRoleApplication':[{'UISceneConfigurationName':'Workspace','UISceneDelegateClassName':'$(PRODUCT_MODULE_NAME).SceneDelegate'}]}}, 'UILaunchScreen':{}, 'UISupportedInterfaceOrientations':['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationLandscapeLeft','UIInterfaceOrientationLandscapeRight']}
info['NSFaceIDUsageDescription'] = 'Use Face ID to unlock private spatial layouts stored on this device. Device unlock does not grant company or publication access.'
(root / 'App/Info.plist').write_bytes(plistlib.dumps(info))
(root / 'App/capacitor.config.json').write_text(__import__('json').dumps({'appId':'com.auxiliumenvironmental.spatial','appName':'Auxilium Spatial','webDir':'public','server':{'hostname':'localhost','iosScheme':'capacitor'},'plugins':{'CapacitorHttp':{'enabled':False},'CapacitorCookies':{'enabled':False}},'loggingBehavior':'none'}, indent=2) + '\n')
print(f'Generated {project} with {len(app_sources)} app sources and {len(test_sources)} native test sources.')
