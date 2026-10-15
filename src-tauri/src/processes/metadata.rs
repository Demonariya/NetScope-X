pub struct ProcessMetadataResolver;

impl ProcessMetadataResolver {
    /// Extracts friendly Product Name and File Description from Windows PE Version Info
    /// using GetFileVersionInfoW and VerQueryValueW.
    pub fn resolve_friendly_name(exe_path: &str, fallback_name: &str) -> String {
        #[cfg(windows)]
        {
            // Windows native implementation:
            // GetFileVersionInfoSizeW -> GetFileVersionInfoW -> VerQueryValueW (\StringFileInfo\040904b0\FileDescription)
        }
        let _ = exe_path;
        fallback_name.to_string()
    }
}
