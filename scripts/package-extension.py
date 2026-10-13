"""Package extension files only, plus the MIT license; no private profiles or test artifacts."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
extension = root / "smart-autofill"
manifest = json.loads((extension / "manifest.json").read_text(encoding="utf-8"))
version = manifest["version"]
if not all(part.isdecimal() for part in version.split(".")):
    raise ValueError("Invalid extension version")
output = root / "dist"
output.mkdir(exist_ok=True)
archive = output / f"smart-autofill-{version}.zip"
files = sorted(file for file in extension.rglob("*") if file.is_file())
allowed_extensions = {".js", ".json", ".html", ".css", ".png", ".md"}
for file in files:
    if file.is_symlink() or file.suffix.lower() not in allowed_extensions:
        raise ValueError(f"Unexpected extension file: {file.relative_to(root)}")
    if any(part.startswith(".") for part in file.relative_to(extension).parts):
        raise ValueError("Hidden extension file cannot be packaged")
with ZipFile(archive, "w", compression=ZIP_DEFLATED) as bundle:
    for file in files:
        bundle.write(file, file.relative_to(root).as_posix())
    bundle.write(root / "LICENSE", "smart-autofill/LICENSE")
with ZipFile(archive) as bundle:
    if bundle.testzip() is not None:
        raise ValueError("Corrupt archive")
    names = bundle.namelist()
    if "smart-autofill/manifest.json" not in names or not all(name.startswith("smart-autofill/") for name in names):
        raise ValueError("Invalid archive structure")
    if json.loads(bundle.read("smart-autofill/manifest.json"))["version"] != version:
        raise ValueError("Archive version mismatch")
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(output / "SHA256SUMS.txt").write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
print(json.dumps({"archive": str(archive), "version": version, "files": len(names), "sha256": digest}))
