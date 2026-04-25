import ExpoModulesCore
import MusicKit
import StoreKit

public class AppleMusicModule: Module {
  private func statusString(from status: SKCloudServiceAuthorizationStatus) -> String {
    switch status {
    case .authorized:
      return "authorized"
    case .denied:
      return "denied"
    case .restricted:
      return "restricted"
    case .notDetermined:
      return "notDetermined"
    @unknown default:
      return "notDetermined"
    }
  }

  @available(iOS 15.1, *)
  private func statusString(from status: MusicAuthorization.Status) -> String {
    switch status {
    case .authorized:
      return "authorized"
    case .denied:
      return "denied"
    case .restricted:
      return "restricted"
    case .notDetermined:
      return "notDetermined"
    @unknown default:
      return "notDetermined"
    }
  }

  public func definition() -> ModuleDefinition {
    Name("AppleMusic")

    Function("getModuleVersion") {
      return "apple-music-native-v3"
    }

    AsyncFunction("requestAuthorization") { (promise: Promise) in
      guard Bundle.main.object(forInfoDictionaryKey: "NSAppleMusicUsageDescription") != nil else {
        promise.reject(
          "APPLE_MUSIC_CONFIG_ERROR",
          "NSAppleMusicUsageDescription is missing from the app Info.plist"
        )
        return
      }

      if #available(iOS 15.1, *) {
        Task { [self] in
          let currentStatus = MusicAuthorization.currentStatus
          guard currentStatus == .notDetermined else {
            promise.resolve(self.statusString(from: currentStatus))
            return
          }

          let requestedStatus = await MusicAuthorization.request()
          promise.resolve(self.statusString(from: requestedStatus))
        }
        return
      }

      DispatchQueue.main.async {
        let currentStatus = SKCloudServiceController.authorizationStatus()
        guard currentStatus == .notDetermined else {
          promise.resolve(self.statusString(from: currentStatus))
          return
        }

        SKCloudServiceController.requestAuthorization { status in
          promise.resolve(self.statusString(from: status))
        }
      }
    }

    Function("getDiagnostics") {
      var diagnostics: [String: Any] = [
        "bundleIdentifier": Bundle.main.bundleIdentifier ?? "",
        "hasAppleMusicUsageDescription": Bundle.main.object(forInfoDictionaryKey: "NSAppleMusicUsageDescription") != nil,
        "skCloudServiceAuthorizationStatus": statusString(
          from: SKCloudServiceController.authorizationStatus()
        ),
      ]

      if #available(iOS 15.1, *) {
        diagnostics["musicAuthorizationStatus"] = statusString(from: MusicAuthorization.currentStatus)
      } else {
        diagnostics["musicAuthorizationStatus"] = "unavailable"
      }

      return diagnostics
    }

    AsyncFunction("requestStorefrontCountryCode") { (promise: Promise) in
      let controller = SKCloudServiceController()
      controller.requestStorefrontCountryCode { countryCode, error in
        if let error = error {
          promise.reject("APPLE_MUSIC_ERROR", error.localizedDescription)
          return
        }
        guard let countryCode else {
          promise.reject(
            "APPLE_MUSIC_NO_COUNTRY_CODE",
            "Apple Music did not return a storefront country code."
          )
          return
        }
        promise.resolve(countryCode)
      }
    }

    AsyncFunction("requestSubscriptionStatus") { (promise: Promise) in
      let controller = SKCloudServiceController()
      controller.requestCapabilities { capabilities, error in
        if let error = error {
          promise.reject("APPLE_MUSIC_ERROR", error.localizedDescription)
          return
        }
        promise.resolve([
          "musicCatalogPlayback": capabilities.contains(.musicCatalogPlayback),
          "musicCatalogSubscriptionEligible": capabilities.contains(.musicCatalogSubscriptionEligible),
          "addToCloudMusicLibrary": capabilities.contains(.addToCloudMusicLibrary),
        ])
      }
    }

    AsyncFunction("requestUserToken") { (developerToken: String, promise: Promise) in
      let controller = SKCloudServiceController()
      controller.requestUserToken(forDeveloperToken: developerToken) { userToken, error in
        if let error = error {
          promise.reject("APPLE_MUSIC_ERROR", error.localizedDescription)
          return
        }
        guard let userToken = userToken else {
          promise.reject("APPLE_MUSIC_ERROR", "No user token returned")
          return
        }
        promise.resolve(userToken)
      }
    }
  }
}
