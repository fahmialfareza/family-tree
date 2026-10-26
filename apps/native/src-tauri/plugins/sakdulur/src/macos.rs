use std::ffi::{c_char, CStr};

use crate::AppleAuthorization;

extern "C" {
    // macos/AppleSignIn.swift. Blocks until the sheet closes; every out-string is strdup'ed (or null).
    fn sakdulur_apple_authorize(
        nonce: *const c_char,
        out_token: *mut *mut c_char,
        out_code: *mut *mut c_char,
        out_given: *mut *mut c_char,
        out_family: *mut *mut c_char,
        out_error: *mut *mut c_char,
    );
    fn free(ptr: *mut std::ffi::c_void);
}

unsafe fn take(ptr: *mut c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    let s = CStr::from_ptr(ptr).to_string_lossy().into_owned();
    free(ptr.cast());
    Some(s)
}

pub fn authorize(nonce: &str) -> Result<AppleAuthorization, String> {
    let nonce = std::ffi::CString::new(nonce).map_err(|e| e.to_string())?;
    let mut out: [*mut c_char; 5] = [std::ptr::null_mut(); 5];
    unsafe {
        sakdulur_apple_authorize(nonce.as_ptr(), &mut out[0], &mut out[1], &mut out[2], &mut out[3], &mut out[4]);
        let [token, code, given, family, error] = out.map(|p| take(p));
        if let Some(error) = error {
            return Err(error);
        }
        Ok(AppleAuthorization {
            identity_token: token.ok_or("Apple returned no identity token")?,
            authorization_code: code,
            given_name: given,
            family_name: family,
        })
    }
}
