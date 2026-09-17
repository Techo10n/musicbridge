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


    /**
     Start a library playlist playing in the Music app.

     iOS exposes no way to navigate the Music app's UI to a specific *library*
     playlist. A library id is not deep-linkable — `music.apple.com/library/playlist/{id}`
     resolves to "item not available" — and only catalog playlists have URLs,
     which a private playlist this app creates does not get.

     `SystemMusicPlayer` controls the Music app's own playback state, so
     queueing the playlist there and playing means switching to Music shows it
     as Now Playing, with its title linking through to the playlist itself.
     That is the closest iOS permits to opening it.

     Resolves true when playback started, false when the playlist could not be
     found in the library — the caller then falls back to opening the library.
     */
    AsyncFunction("playLibraryPlaylist") { (playlistId: String, promise: Promise) in
      guard #available(iOS 16.0, *) else {
        promise.reject("APPLE_MUSIC_UNSUPPORTED", "Playing a library playlist requires iOS 16 or later.")
        return
      }

      Task {
        do {
          // A playlist created through the Apple Music API syncs to the device
          // library asynchronously, so it may legitimately not be here yet.
          var request = MusicLibraryRequest<Playlist>()
          request.filter(matching: \.id, equalTo: MusicItemID(playlistId))
          let response = try await request.response()

          guard let playlist = response.items.first else {
            promise.resolve(false)
            return
          }

          SystemMusicPlayer.shared.queue = [playlist]
          try await SystemMusicPlayer.shared.play()
          promise.resolve(true)
        } catch {
          promise.reject("APPLE_MUSIC_PLAY_FAILED", error.localizedDescription)
        }
      }
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
