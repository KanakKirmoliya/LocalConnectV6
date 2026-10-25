export type UserRole = "user" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  area: string;
  role: UserRole;
  createdAt: string;
}

export type ListingType = "room" | "vehicle" | "lost_found" | "service";
export type ListingStatus = "active" | "closed" | "draft";

export interface RoomDetails {
  rent: number;
  deposit?: number;
  maintenance?: number;
  roomType?: "Single" | "1RK" | "1BHK" | "2BHK" | "Shared" | "PG" | "Other";
  availableFrom?: string | null;
  availabilityConfirmedAt?: string;
  period: string;
  amenities: string[];
  verified?: boolean;
}

export interface VehicleDetails {
  vehicleType: "Scooty" | "Bike" | "Car" | "Other";
  rentalPrice: number;
  pricingPeriod: string;
  available: boolean;
}

export interface LostFoundDetails {
  kind: "lost" | "found";
  itemName?: string;
  incidentDate?: string;
}

export interface ServiceDetails {
  serviceCategory: "Electrician" | "Mechanic" | "Plumber" | "Notes" | "Other";
  pricingInfo: string;
  rating?: number;
  jobsCount?: number;
  available: boolean;
}

export interface VideoItem {
  url: string;
  name?: string;
  size?: number;
}

export interface Listing {
  id: string;
  ownerId: string;
  ownerName: string;
  type: ListingType;
  title: string;
  description: string;
  locality: string;
  status: ListingStatus;
  photos: Array<string | { url: string; name?: string; size?: number; mimeType?: string }>;
  videos?: VideoItem[];
  coverIndex?: number;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  location?: {
    type: "Point";
    coordinates: [number, number];
  };
  roomDetails?: RoomDetails;
  vehicleDetails?: VehicleDetails;
  lostFoundDetails?: LostFoundDetails;
  serviceDetails?: ServiceDetails;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedListings {
  success: boolean;
  count: number;
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
  data: Listing[];
}
