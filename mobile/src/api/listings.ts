import { Platform } from "react-native";
import { apiClient } from "./client";
import { Listing, PaginatedListings } from "../types";

export interface ListingFilterParams {
  type?: string;
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
  maxRent?: number;
  minRent?: number;
  roomType?: string;
  amenity?: string;
  availableFrom?: string;
  vehicleType?: string;
  kind?: "lost" | "found";
  serviceCategory?: string;
  lat?: number;
  lng?: number;
  radius?: number;
}

export async function fetchListings(params: ListingFilterParams = {}): Promise<PaginatedListings> {
  const response = await apiClient.get<PaginatedListings>("/listings", { params });
  return response.data;
}

export async function fetchListingById(id: string): Promise<Listing> {
  const response = await apiClient.get<{ success: boolean; data: Listing }>(`/listings/${id}`);
  return response.data.data;
}

export async function createListing(data: Record<string, any>): Promise<Listing> {
  const response = await apiClient.post<{ success: boolean; data: Listing }>("/listings", data);
  return response.data.data;
}

export async function updateListing(id: string, data: Record<string, any>): Promise<Listing> {
  const response = await apiClient.patch<{ success: boolean; data: Listing }>(`/listings/${id}`, data);
  return response.data.data;
}

export async function deleteListing(id: string): Promise<{ success: boolean; deletedId: string }> {
  const response = await apiClient.delete<{ success: boolean; deletedId: string }>(`/listings/${id}`);
  return response.data;
}

export async function confirmListingAvailability(id: string): Promise<string> {
  const response = await apiClient.patch<{ success: boolean; availabilityConfirmedAt: string }>(
    `/listings/${id}/availability`
  );
  return response.data.availabilityConfirmedAt;
}

export interface UploadedFileResponse {
  url: string;
  originalName: string;
  size: number;
  mimeType: string;
}

export async function uploadListingMedia(
  files: Array<{ uri: string; name?: string; type?: string }>
): Promise<UploadedFileResponse[]> {
  const formData = new FormData();

  files.forEach((file, index) => {
    const ext = file.uri.split(".").pop()?.toLowerCase() || "jpg";
    const mimeType = file.type || (ext === "mp4" || ext === "mov" ? "video/mp4" : "image/jpeg");
    const name = file.name || `mobile_media_${index}_${Date.now()}.${ext}`;

    formData.append("files", {
      uri: Platform.OS === "android" ? file.uri : file.uri.replace("file://", ""),
      name,
      type: mimeType,
    } as any);
  });

  const response = await apiClient.post<{ success: boolean; files: any[] }>(
    "/upload/media",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );

  return (response.data.files || []).map((f: any) => ({
    url: f.url,
    originalName: f.originalName || f.name || "",
    size: f.size || 0,
    mimeType: f.mimeType || "",
  }));
}
