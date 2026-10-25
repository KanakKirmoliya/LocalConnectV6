import React, { useState } from "react";
import { StyleSheet, View, ScrollView, Alert } from "react-native";
import { Text, Surface, Button, Chip, Portal, Modal, TextInput, Snackbar } from "react-native-paper";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, User, Calendar, Edit3, Trash2, ShieldQuestion, Send } from "lucide-react-native";
import { fetchListingById, deleteListing } from "../../src/api/listings";
import { LoadingView } from "../../src/components/LoadingView";
import { ErrorView } from "../../src/components/ErrorView";
import { useAuth } from "../../src/context/AuthContext";

export default function LostFoundDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [claimModalVisible, setClaimModalVisible] = useState(false);
  const [claimProof, setClaimProof] = useState("");
  const [snackMsg, setSnackMsg] = useState("");

  const {
    data: item,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["listing", id],
    queryFn: () => fetchListingById(id!),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteListing(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listings", "lost_found"] });
      router.back();
    },
    onError: (err: any) => {
      Alert.alert("Delete Failed", err.response?.data?.error || "Could not delete report.");
    },
  });

  const isOwner = user && item && user.id === item.ownerId;
  const isLost = item?.lostFoundDetails?.kind === "lost";

  const handleDelete = () => {
    Alert.alert(
      "Delete Report",
      "Are you sure you want to remove this lost & found report?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(),
        },
      ]
    );
  };

  const handleSendClaim = () => {
    if (!claimProof.trim()) {
      Alert.alert("Input Required", "Please provide a description or proof details.");
      return;
    }
    setClaimModalVisible(false);
    setClaimProof("");
    setSnackMsg("Message sent to the reporter. They will review your information.");
  };

  if (isLoading) return <LoadingView message="Loading report details..." />;
  if (isError || !item) {
    return (
      <ErrorView
        message={(error as any)?.message || "Item report not found."}
        onRetry={() => refetch()}
      />
    );
  }

  const formattedDate = item.lostFoundDetails?.incidentDate
    ? new Date(item.lostFoundDetails.incidentDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Recently reported";

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Status & Title Card */}
        <Surface style={styles.card} elevation={1}>
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.kindBadge,
                { backgroundColor: isLost ? "#FEE2E2" : "#E0F2FE" },
              ]}
            >
              <Text
                variant="labelMedium"
                style={{
                  color: isLost ? "#B91C1C" : "#0369A1",
                  fontWeight: "800",
                  textTransform: "uppercase",
                }}
              >
                {isLost ? "Missing Item" : "Found Item"}
              </Text>
            </View>

            <View style={styles.dateBadge}>
              <Calendar size={13} color="#64748B" />
              <Text variant="labelSmall" style={styles.dateText}>
                {formattedDate}
              </Text>
            </View>
          </View>

          <Text variant="headlineSmall" style={styles.title}>
            {item.title}
          </Text>

          <View style={styles.metaRow}>
            <MapPin size={16} color="#64748B" />
            <Text variant="bodyMedium" style={styles.metaText}>
              Location: {item.locality}
            </Text>
          </View>
        </Surface>

        {/* Description Section */}
        <Surface style={styles.card} elevation={1}>
          <Text variant="titleMedium" style={styles.sectionHeading}>
            Item Description & Clues
          </Text>
          <Text variant="bodyMedium" style={styles.desc}>
            {item.description || "No specific details provided. Check with the reporter."}
          </Text>
        </Surface>

        {/* Reporter Info */}
        <Surface style={styles.card} elevation={1}>
          <Text variant="titleMedium" style={styles.sectionHeading}>
            Reported By
          </Text>
          <View style={styles.ownerRow}>
            <View style={[styles.ownerAvatar, { backgroundColor: isLost ? "#FEE2E2" : "#E0F2FE" }]}>
              <User size={24} color={isLost ? "#DC2626" : "#0284C7"} />
            </View>
            <View>
              <Text variant="titleSmall" style={styles.ownerName}>
                {item.ownerName}
              </Text>
              <Text variant="bodySmall" style={styles.ownerSub}>
                Community Reporter · LocalConnect
              </Text>
            </View>
          </View>
        </Surface>

        {/* Owner Controls */}
        {isOwner ? (
          <Surface style={styles.ownerControlsCard} elevation={1}>
            <Text variant="titleSmall" style={styles.ownerControlsTitle}>
              Report Management (Reporter)
            </Text>
            <View style={styles.actionRow}>
              <Button
                mode="outlined"
                icon={() => <Edit3 size={16} color="#DC2626" />}
                onPress={() => router.push(`/lost-found/create?id=${item.id}`)}
                style={styles.editBtn}
                textColor="#DC2626"
              >
                Edit
              </Button>
              <Button
                mode="contained"
                icon={() => <Trash2 size={16} color="#FFFFFF" />}
                onPress={handleDelete}
                loading={deleteMutation.isPending}
                style={styles.deleteBtn}
                buttonColor="#DC2626"
              >
                Delete
              </Button>
            </View>
          </Surface>
        ) : (
          /* Customer Claim/Contact Action */
          <Button
            mode="contained"
            icon={() => <ShieldQuestion size={18} color="#FFFFFF" />}
            onPress={() => setClaimModalVisible(true)}
            style={styles.claimBtn}
            buttonColor={isLost ? "#DC2626" : "#0284C7"}
          >
            {isLost ? "I Have Found This Item" : "This Is My Item (Claim)"}
          </Button>
        )}
      </ScrollView>

      {/* Claim / Proof Modal */}
      <Portal>
        <Modal
          visible={claimModalVisible}
          onDismiss={() => setClaimModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <Text variant="titleMedium" style={styles.modalTitle}>
            {isLost ? "Contact Owner" : "Prove It's Yours"}
          </Text>
          <Text variant="bodySmall" style={styles.modalSub}>
            {isLost
              ? "Tell them where the item is now or how they can meet you to retrieve it."
              : "Describe unique marks, serial numbers, wallpaper, or hidden items inside."}
          </Text>

          <TextInput
            label="Your Message / Proof"
            value={claimProof}
            onChangeText={setClaimProof}
            multiline
            numberOfLines={4}
            mode="outlined"
            style={styles.modalInput}
            placeholder={
              isLost
                ? "I found this item near the canteen. Call or meet me..."
                : "It has a scratch on the back and contains a red keychain inside..."
            }
          />

          <View style={styles.modalActions}>
            <Button mode="text" onPress={() => setClaimModalVisible(false)}>
              Cancel
            </Button>
            <Button
              mode="contained"
              icon={() => <Send size={16} color="#FFFFFF" />}
              onPress={handleSendClaim}
              buttonColor={isLost ? "#DC2626" : "#0284C7"}
            >
              Send Message
            </Button>
          </View>
        </Modal>
      </Portal>

      <Snackbar
        visible={!!snackMsg}
        onDismiss={() => setSnackMsg("")}
        duration={3500}
      >
        {snackMsg}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    padding: 18,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    marginBottom: 14,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  kindBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dateBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dateText: {
    color: "#64748B",
    marginLeft: 4,
  },
  title: {
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaText: {
    color: "#64748B",
    marginLeft: 6,
  },
  sectionHeading: {
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 10,
  },
  desc: {
    color: "#334155",
    lineHeight: 22,
  },
  ownerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  ownerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  ownerName: {
    fontWeight: "700",
    color: "#0F172A",
  },
  ownerSub: {
    color: "#64748B",
  },
  ownerControlsCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderWidth: 1,
  },
  ownerControlsTitle: {
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  editBtn: {
    flex: 1,
    borderRadius: 8,
    borderColor: "#DC2626",
  },
  deleteBtn: {
    flex: 1,
    borderRadius: 8,
  },
  claimBtn: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 6,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    padding: 24,
    margin: 20,
    borderRadius: 16,
  },
  modalTitle: {
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },
  modalSub: {
    color: "#64748B",
    marginBottom: 16,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: "#FFFFFF",
    marginBottom: 16,
    height: 100,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
});
