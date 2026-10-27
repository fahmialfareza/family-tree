import AuthenticationServices
import CryptoKit
import Photos
import SafariServices
import Tauri
import UIKit
import WebKit

struct AppleAuthorizeArgs: Decodable {
  let nonce: String
}

struct OpenUrlArgs: Decodable {
  let url: String
}

struct SaveFileArgs: Decodable {
  let name: String
  let mime: String
  let data: String  // base64
}

// Native pieces of the Sakdulur app (see ../src/lib.rs): Sign in with Apple (Apple's sheet over the app), saving
// exported pictures to Photos, and an in-app browser sheet for the site's public pages (Privacy, Terms), called from
// the app's Rust code.
class SakdulurPlugin: Plugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
  private var pending: Invoke?
  private var controller: ASAuthorizationController?

  @objc public func appleAuthorize(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(AppleAuthorizeArgs.self)
    pending = invoke
    DispatchQueue.main.async {
      let request = ASAuthorizationAppleIDProvider().createRequest()
      request.requestedScopes = [.fullName, .email]
      // Apple expects the SHA-256 of the nonce; the site keeps the raw value and sends it to the API.
      request.nonce = SHA256.hash(data: Data(args.nonce.utf8)).map { String(format: "%02x", $0) }.joined()
      let controller = ASAuthorizationController(authorizationRequests: [request])
      controller.delegate = self
      controller.presentationContextProvider = self
      self.controller = controller
      controller.performRequests()
    }
  }

  // Pictures only (other files are ordinary downloads, saved to Files › Sakdulur). Asks for "add only" access,
  // which can't read the library (Info.plist NSPhotoLibraryAddUsageDescription).
  @objc public func saveFile(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SaveFileArgs.self)
    guard args.mime.hasPrefix("image/"), let data = Data(base64Encoded: args.data, options: .ignoreUnknownCharacters) else {
      invoke.reject("only pictures can be saved to Photos")
      return
    }
    guard #available(iOS 14, *) else {  // the app needs iOS 15; the package itself declares iOS 13
      invoke.reject("photos-denied")
      return
    }
    PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
      guard status == .authorized || status == .limited else {
        invoke.reject("photos-denied")
        return
      }
      PHPhotoLibrary.shared().performChanges({
        let options = PHAssetResourceCreationOptions()
        options.originalFilename = args.name
        PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: options)
      }) { ok, error in
        if ok {
          invoke.resolve(["name": args.name, "location": "photos"])
        } else {
          invoke.reject(error?.localizedDescription ?? "could not save to Photos")
        }
      }
    }
  }

  @objc public func openInAppBrowser(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(OpenUrlArgs.self)
    guard let url = URL(string: args.url), url.scheme == "https" || url.scheme == "http" else {
      invoke.reject("invalid url")
      return
    }
    DispatchQueue.main.async {
      guard let presenter = self.manager.viewController else {
        invoke.reject("no window")
        return
      }
      let browser = SFSafariViewController(url: url)
      browser.dismissButtonStyle = .done
      presenter.present(browser, animated: true)
      invoke.resolve()
    }
  }

  public func authorizationController(controller _: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
    guard let invoke = pending else { return }
    pending = nil
    controller = nil
    guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
      let token = credential.identityToken.flatMap({ String(data: $0, encoding: .utf8) })
    else {
      invoke.reject("Apple returned no identity token")
      return
    }
    // Only non-nil values: optionals do not serialize cleanly through the Tauri bridge.
    var result: [String: String] = ["identityToken": token]
    if let code = credential.authorizationCode.flatMap({ String(data: $0, encoding: .utf8) }) { result["authorizationCode"] = code }
    if let given = credential.fullName?.givenName { result["givenName"] = given }
    if let family = credential.fullName?.familyName { result["familyName"] = family }
    invoke.resolve(result)
  }

  public func authorizationController(controller _: ASAuthorizationController, didCompleteWithError error: Error) {
    guard let invoke = pending else { return }
    pending = nil
    controller = nil
    if let e = error as? ASAuthorizationError, e.code == .canceled {
      invoke.reject("canceled")
    } else {
      invoke.reject(error.localizedDescription)
    }
  }

  public func presentationAnchor(for _: ASAuthorizationController) -> ASPresentationAnchor {
    manager.viewController?.view.window ?? ASPresentationAnchor()
  }
}

@_cdecl("init_plugin_sakdulur")
func initPlugin() -> Plugin {
  return SakdulurPlugin()
}
