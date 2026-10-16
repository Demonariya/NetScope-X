fn main() {
    println!("cargo::rustc-check-cfg=cfg(desktop)");
    tauri_build::build()
}
