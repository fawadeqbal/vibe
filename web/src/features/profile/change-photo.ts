"use client";

import { chooseAction } from "@/components/shared/action-sheet";
import { capturePhoto } from "@/components/shared/camera-capture";
import { errorMessage } from "@/lib/api/errors";
import { pickImageFile, prepareImage } from "@/lib/media";
import { useSession } from "@/stores/session";
import { toast } from "@/stores/ui";

/**
 * Camera or files → resized here → uploaded right away (`POST /me/avatar`,
 * the server returns the new URL on the profile). Shared by the profile form
 * and the Me screen's "Add a photo" prompt. `onUploading` drives a spinner.
 * Resolves true when a new photo was saved.
 */
export async function changeProfilePhoto(onUploading?: (busy: boolean) => void): Promise<boolean> {
  const source = await chooseAction([
    { value: "camera" as const, label: "Take a photo", icon: "photo_camera" },
    { value: "files" as const, label: "Choose from gallery", icon: "photo_library" },
  ]);
  if (!source) return false;
  try {
    const raw = source === "camera" ? await capturePhoto("Take photo") : await pickImageFile();
    if (!raw) return false;
    onUploading?.(true);
    await useSession.getState().uploadAvatar(await prepareImage(raw));
    return true;
  } catch (e) {
    toast(errorMessage(e, "Couldn't open the camera or your files."), { error: true });
    return false;
  } finally {
    onUploading?.(false);
  }
}
