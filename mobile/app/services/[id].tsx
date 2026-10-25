import React, { useState } from "react";
import { StyleSheet, View, ScrollView, Alert } from "react-native";
import { Text, Surface, Button, Chip, Snackbar } from "react-native-paper";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, User, Star, Wrench, Edit3, Trash2, CalendarCheck } from "lucide-react-native";
import { fetchListingById, deleteListing } from "../../src/api/listings";
import { LoadingView } from "../../src/components/LoadingView";
import { ErrorView } from "../../src/components/ErrorView";
import { useAuth } from "../../src/context/AuthContext";

export default function ServiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [snackMsg, setSnackMsg] = useState("");

  const {
    data: service,
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
      queryClient.invalidateQueries({ queryKey: ["listings", "service"] });
      router.back();
    },
    onError: (err: any) => {
      Alert.alert("Delete Failed", err.response?.data?.error || "Could not delete service listing.");
    },
  });

  const isOwner = user && service && user.id === service.ownerId;

  const handleDelete = () => {
    Alert.alert(
      "Delete Service Listing",
      "Are you sure you want to remove this service profile?",
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

  const handleBookService = () => {
    setSnackMsg(`Booking request sent to ${service?.title}. They will contact you shortly.`);
  };

  if (isLoading) return <LoadingView message="Loading service provider details..." />;
  if (isError || !service) {
    return (
      <ErrorView
        message={(error as any)?.message || "Service profile not found."}
        onRetry={() => refetch()}
      />
    );
  }

  const isAvailable = service.serviceDetails?.available ?? true;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header Card */}
        <Surface style={styles.card} elevation={1}>
          <View style={styles.topRow}>
            <View style={styles.tradeBadge}>
              <Wrench size={14} color="#059669" />
              <Text variant="labelMedium" style={styles.tradeText}>
                {service.serviceDetails?.serviceCategory || "Local Service"}
              </Text>
            </View>

            <Chip
              style={{
                backgroundColor: isAvailable ? "#ECFDF5" : "#FEF2F2",
              }}
              textStyle={{
                color: isAvailable ? "#059669" : "#DC2626",
                fontWeight: "700",
              }}
            >
              {isAvailable ? "Available Today" : "Busy Today"}
            </Chip>
          </View>

          <Text variant="headlineSmall" style={styles.title}>
            {service.title}
          </Text>

          <View style={styles.metaRow}>
            <View style={styles.ratingBadge}>
              <Star size={14} color="#EAB308" fill="#EAB308" />
              <Text variant="labelMedium" style={styles.ratingText}>
                {service.serviceDetails?.rating || 5.0} ({service.serviceDetails?.jobsCount || 0} completed)
              </Text>
            </View>

            <View style={styles.locationTag}>
              <MapPin size={14} color="#64748B" />
              <Text variant="bodySmall" style={styles.locationText}>
                {service.locality}
              </Text>
            </View>
          </View>
        </Surface>

        {/* Pricing Card */}
        <Surface style={styles.card} elevation={1}>
          <Text variant="titleMedium" style={styles.sectionHeading}>
            Pricing & Charges
          </Text>
          <Text variant="headlineSmall" style={styles.priceHeading}>
            {service.serviceDetails?.pricingInfo || "Contact for rate"}
          </Text>
        </Surface>

        {/* Description Section */}
        <Surface style={styles.card} elevation={1}>
          <Text variant="titleMedium" style={styles.sectionHeading}>
            Service Description & Experience
          </Text>
          <Text variant="bodyMedium" style={styles.desc}>
            {service.description || "Experienced local professional providing reliable service."}
          </Text>
        </Surface>

        {/* Provider Profile Info */}
        <Surface style={styles.card} elevation={1}>
          <Text variant="titleMedium" style={styles.sectionHeading}>
            Provider Profile
          </Text>
          <View style={styles.ownerRow}>
            <View style={styles.ownerAvatar}>
              <User size={24} color="#059669" />
            </View>
            <View>
              <Text variant="titleSmall" style={styles.ownerName}>
                {service.ownerName}
              </Text>
              <Text variant="bodySmall" style={styles.ownerSub}>
                Community Professional · LocalConnect
              </Text>
            </View>
          </View>
        </Surface>

        {/* Owner Controls */}
        {isOwner ? (
          <Surface style={styles.ownerControlsCard} elevation={1}>
            <Text variant="titleSmall" style={styles.ownerControlsTitle}>
              Listing Controls (Owner)
            </Text>
            <View style={styles.actionRow}>
              <Button
                mode="outlined"
                icon={() => <Edit3 size={16} color="#059669" />}
                onPress={() => router.push(`/services/create?id=${service.id}`)}
                style={styles.editBtn}
                textColor="#059669"
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
          /* Customer Booking Action */
          <Button
            mode="contained"
            icon={() => <CalendarCheck size={18} color="#FFFFFF" />}
            onPress={handleBookService}
            disabled={!isAvailable}
            style={styles.bookBtn}
            buttonColor="#059669"
          >
            {isAvailable ? "Book / Request Service" : "Currently Unavailable"}
          </Button>
        )}
      </ScrollView>

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
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  tradeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tradeText: {
    color: "#065F46",
    fontWeight: "700",
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
    gap: 12,
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEFCE8",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ratingText: {
    color: "#854D0E",
    fontWeight: "600",
    marginLeft: 4,
  },
  locationTag: {
    flexDirection: "row",
    alignItems: "center",
  },
  locationText: {
    color: "#64748B",
    marginLeft: 4,
  },
  sectionHeading: {
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
  },
  priceHeading: {
    color: "#059669",
    fontWeight: "900",
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
    backgroundColor: "#D1FAE5",
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
    borderColor: "#059669",
  },
  deleteBtn: {
    flex: 1,
    borderRadius: 8,
  },
  bookBtn: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 6,
  },
});
