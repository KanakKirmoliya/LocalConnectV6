import { apiClient } from "./client";

export interface Inquiry {
  id: string;
  _id: string;
  listingId: string;
  listingTitle: string;
  buyerName: string;
  message: string;
  status: "pending" | "accepted" | "declined";
  sellerEmail?: string;
  sellerPhone?: string;
  createdAt: string;
}

export async function createInquiry(listingId: string, message?: string): Promise<Inquiry> {
  const response = await apiClient.post<{ success: boolean; data: Inquiry }>("/requests", {
    listingId,
    message,
  });
  return response.data.data;
}

export async function fetchInquiries(): Promise<{ sent: Inquiry[]; inbox: Inquiry[] }> {
  const [sentResponse, inboxResponse] = await Promise.all([
    apiClient.get<{ data: Inquiry[] }>("/requests/sent"),
    apiClient.get<{ data: Inquiry[] }>("/requests/inbox"),
  ]);
  return {
    sent: sentResponse.data.data || [],
    inbox: inboxResponse.data.data || [],
  };
}

export async function updateInquiryStatus(
  id: string,
  status: "accepted" | "declined"
): Promise<Inquiry> {
  const response = await apiClient.patch<{ data: Inquiry }>(`/requests/${id}`, { status });
  return response.data.data;
}
