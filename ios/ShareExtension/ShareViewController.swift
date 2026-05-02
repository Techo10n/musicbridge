import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
  private let appScheme = "museaic://import-reel"

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    Task { await handleSharedInput() }
  }

  private func handleSharedInput() async {
    guard let extensionItems = extensionContext?.inputItems as? [NSExtensionItem] else {
      finish()
      return
    }

    for item in extensionItems {
      guard let attachments = item.attachments else { continue }
      for provider in attachments {
        if let sharedURL = await loadURL(from: provider) {
          openHostApp(with: sharedURL.absoluteString)
          return
        }

        if let sharedText = await loadText(from: provider) {
          openHostApp(with: sharedText)
          return
        }
      }
    }

    finish()
  }

  private func loadURL(from provider: NSItemProvider) async -> URL? {
    let urlTypes = [
      UTType.url.identifier,
    ]

    for typeIdentifier in urlTypes where provider.hasItemConformingToTypeIdentifier(typeIdentifier) {
      do {
        let item = try await provider.loadItem(forTypeIdentifier: typeIdentifier, options: nil)
        if let url = item as? URL { return url }
        if let text = item as? String { return URL(string: text) }
        if let data = item as? Data, let text = String(data: data, encoding: .utf8) {
          return URL(string: text)
        }
      } catch {
        continue
      }
    }

    return nil
  }

  private func loadText(from provider: NSItemProvider) async -> String? {
    let textTypes = [
      UTType.plainText.identifier,
      UTType.text.identifier,
    ]

    for typeIdentifier in textTypes where provider.hasItemConformingToTypeIdentifier(typeIdentifier) {
      do {
        let item = try await provider.loadItem(forTypeIdentifier: typeIdentifier, options: nil)
        if let text = item as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          return text
        }
        if let data = item as? Data,
           let text = String(data: data, encoding: .utf8),
           !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          return text
        }
      } catch {
        continue
      }
    }

    return nil
  }

  private func openHostApp(with sharedText: String) {
    guard var components = URLComponents(string: appScheme) else {
      finish()
      return
    }

    components.queryItems = [URLQueryItem(name: "text", value: sharedText)]

    guard let url = components.url else {
      finish()
      return
    }

    extensionContext?.open(url) { [weak self] _ in
      self?.finish()
    }
  }

  private func finish() {
    extensionContext?.completeRequest(returningItems: nil)
  }
}
