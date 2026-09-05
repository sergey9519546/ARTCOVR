import { useCallback, useEffect, useRef, useState } from "react";
import { REFERENCE_UPLOAD_MAX_BYTES, REFERENCE_UPLOAD_MEDIA_TYPES, uploadReference } from "@/lib/artcovr/functions";

/** A photo supplements the canvas; choosing one never changes the edit source. */
export function useReferencePhoto(artworkId: string) {
  const [photo, setPhoto] = useState<{ id?: string; url: string; name: string }>();
  const [error, setError] = useState("");
  const epoch = useRef(0);
  const objectUrl = useRef<string | undefined>(undefined);
  const clear = useCallback(() => {
    epoch.current += 1;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = undefined;
    setPhoto(undefined);
    setError("");
  }, []);
  useEffect(() => () => {
    epoch.current += 1;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!(REFERENCE_UPLOAD_MEDIA_TYPES as readonly string[]).includes(file.type)) {
      setError("Use a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > REFERENCE_UPLOAD_MAX_BYTES) {
      setError("That file is over the 8 MB limit.");
      return;
    }
    clear();
    const requestEpoch = epoch.current;
    const url = URL.createObjectURL(file);
    objectUrl.current = url;
    setPhoto({ url, name: file.name });
    try {
      const { referenceUploadId } = await uploadReference(file, artworkId);
      if (epoch.current === requestEpoch) setPhoto({ id: referenceUploadId, url, name: file.name });
    } catch (cause) {
      if (epoch.current !== requestEpoch) return;
      clear();
      setError(cause instanceof Error ? cause.message : "Your photo could not be uploaded.");
    }
  }
  return { photo, error, pick, clear, uploading: Boolean(photo && !photo.id) };
}

export function ReferencePhotoInput({ reference, disabled }: {
  reference: ReturnType<typeof useReferencePhoto>;
  disabled: boolean;
}) {
  return (
    <div className="mt-4 space-y-2">
      <label className="block text-xs font-bold">
        Add your photo
        <input type="file" accept={REFERENCE_UPLOAD_MEDIA_TYPES.join(",")} disabled={disabled || reference.uploading}
          className="mt-2 block w-full text-xs file:mr-3 file:border file:border-current/30 file:bg-transparent file:px-3 file:py-2 disabled:opacity-40"
          onChange={(event) => { void reference.pick(event.target.files?.[0]); event.target.value = ""; }} />
      </label>
      <p className="text-xs opacity-70">Upload your face or full body, then describe where you want to appear. Your current cover stays the starting image.</p>
      {reference.photo ? <div className="flex items-center gap-3 text-xs" role="status">
        <img src={reference.photo.url} alt="Attached reference photo" className="h-14 w-14 rounded object-cover" />
        <span>{reference.uploading ? "Uploading…" : reference.photo.name}</span>
        <button type="button" disabled={disabled} onClick={reference.clear} className="underline">Remove photo</button>
      </div> : null}
      {reference.error ? <p role="alert" className="text-xs">{reference.error}</p> : null}
    </div>
  );
}
