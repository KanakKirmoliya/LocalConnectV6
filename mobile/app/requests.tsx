import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { Button, Chip, Surface, Text } from "react-native-paper";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchInquiries, updateInquiryStatus } from "../src/api/requests";
import { LoadingView } from "../src/components/LoadingView";
import { ErrorView } from "../src/components/ErrorView";
import { EmptyState } from "../src/components/EmptyState";

export default function RequestsScreen() {
  const [tab, setTab] = useState<"sent" | "inbox">("sent");
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["inquiries"],
    queryFn: fetchInquiries,
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "accepted" | "declined" }) =>
      updateInquiryStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inquiries"] }),
    onError: (err: any) => Alert.alert("Request update failed", err.response?.data?.error || err.message),
  });

  if (isLoading) return <LoadingView message="Loading your inquiries..." />;
  if (isError) {
    return <ErrorView message={(error as any)?.message || "Could not load inquiries."} onRetry={() => refetch()} />;
  }

  const inquiries = data?.[tab] || [];
  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <Chip selected={tab === "sent"} onPress={() => setTab("sent")}>Sent ({data?.sent.length || 0})</Chip>
        <Chip selected={tab === "inbox"} onPress={() => setTab("inbox")}>Received ({data?.inbox.length || 0})</Chip>
      </View>
      <ScrollView contentContainerStyle={inquiries.length ? styles.list : styles.empty}>
        {inquiries.length === 0 ? (
          <EmptyState
            title={tab === "sent" ? "No inquiries yet" : "No received requests"}
            description={tab === "sent" ? "Contact an owner from a listing to start a conversation." : "New requests from people interested in your listings will appear here."}
          />
        ) : inquiries.map((inquiry) => {
          const id = inquiry.id || inquiry._id;
          return (
            <Surface key={id} style={styles.card} elevation={1}>
              <View style={styles.row}>
                <Text variant="titleMedium" style={styles.title}>{inquiry.listingTitle}</Text>
                <Chip compact>{inquiry.status}</Chip>
              </View>
              <Text variant="bodySmall" style={styles.meta}>
                {tab === "inbox" ? `From ${inquiry.buyerName}` : "Your inquiry"}
              </Text>
              <Text variant="bodyMedium" style={styles.message}>{inquiry.message}</Text>
              {tab === "inbox" && inquiry.status === "pending" ? (
                <View style={styles.actions}>
                  <Button
                    mode="contained"
                    onPress={() => statusMutation.mutate({ id, status: "accepted" })}
                    loading={statusMutation.isPending}
                    disabled={statusMutation.isPending}
                  >
                    Accept
                  </Button>
                  <Button
                    mode="outlined"
                    textColor="#DC2626"
                    onPress={() => statusMutation.mutate({ id, status: "declined" })}
                    disabled={statusMutation.isPending}
                  >
                    Decline
                  </Button>
                </View>
              ) : null}
              {tab === "sent" && inquiry.status === "accepted" ? (
                <View style={styles.contact}>
                  <Text variant="bodySmall">Owner accepted. Contact details are now available:</Text>
                  {inquiry.sellerEmail ? <Text variant="bodyMedium">{inquiry.sellerEmail}</Text> : null}
                  {inquiry.sellerPhone ? <Text variant="bodyMedium">{inquiry.sellerPhone}</Text> : null}
                </View>
              ) : null}
            </Surface>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  tabs: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 8 },
  list: { padding: 16, paddingTop: 4, gap: 12 },
  empty: { flexGrow: 1, justifyContent: "center", padding: 16 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 16 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { flex: 1, fontWeight: "700", color: "#0F172A" },
  meta: { color: "#64748B", marginTop: 5 },
  message: { color: "#334155", marginTop: 10 },
  actions: { flexDirection: "row", gap: 8, marginTop: 14 },
  contact: { backgroundColor: "#ECFDF5", borderRadius: 10, padding: 12, marginTop: 12, gap: 4 },
});
