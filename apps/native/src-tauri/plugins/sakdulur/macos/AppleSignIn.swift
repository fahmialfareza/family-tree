import AppKit
import AuthenticationServices
import CryptoKit
import Foundation

// Sign in with Apple on macOS for src/macos.rs: shows Apple's sheet over the app window and blocks the calling
// (non-main) thread until it closes.
private final class Coordinator: NSObject, ASAuthorizationControllerDelegate,
  ASAuthorizationControllerPresentationContextProviding
{
  private let done = DispatchSemaphore(value: 0)
  private var controller: ASAuthorizationController?
  var token: String?
  var code: String?
  var given: String?
  var family: String?
  var error: String?

  func run(nonce: String) {
    DispatchQueue.main.async {
      let request = ASAuthorizationAppleIDProvider().createRequest()
      request.requestedScopes = [.fullName, .email]
      // Apple expects the SHA-256 of the nonce; the site keeps the raw value and sends it to the API.
      request.nonce = SHA256.hash(data: Data(nonce.utf8)).map { String(format: "%02x", $0) }.joined()
      let controller = ASAuthorizationController(authorizationRequests: [request])
      controller.delegate = self
      controller.presentationContextProvider = self
      self.controller = controller
      controller.performRequests()
    }
    done.wait()
  }

  func authorizationController(controller _: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
    defer { done.signal() }
    guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
      error = "Unexpected Apple credential"
      return
    }
    token = credential.identityToken.flatMap { String(data: $0, encoding: .utf8) }
    code = credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
    given = credential.fullName?.givenName
    family = credential.fullName?.familyName
  }

  func authorizationController(controller _: ASAuthorizationController, didCompleteWithError error: Error) {
    defer { done.signal() }
    if let e = error as? ASAuthorizationError, e.code == .canceled {
      self.error = "canceled"
    } else {
      self.error = error.localizedDescription
    }
  }

  func presentationAnchor(for _: ASAuthorizationController) -> ASPresentationAnchor {
    NSApplication.shared.keyWindow ?? NSApplication.shared.windows.first ?? ASPresentationAnchor()
  }
}

@_cdecl("sakdulur_apple_authorize")
public func sakdulurAppleAuthorize(
  nonce: UnsafePointer<CChar>,
  outToken: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>,
  outCode: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>,
  outGiven: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>,
  outFamily: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>,
  outError: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>
) {
  let c = Coordinator()
  c.run(nonce: String(cString: nonce))
  outToken.pointee = c.token.map { strdup($0) }
  outCode.pointee = c.code.map { strdup($0) }
  outGiven.pointee = c.given.map { strdup($0) }
  outFamily.pointee = c.family.map { strdup($0) }
  outError.pointee = c.error.map { strdup($0) }
}
