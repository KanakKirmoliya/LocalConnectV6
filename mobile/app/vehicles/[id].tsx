import React, { useState } from "react";
import { StyleSheet, View, ScrollView, Alert } from "react-native";
import { Text, Surface, Button, Chip, Snackbar } from "react-native-paper";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, User, Bike, Edit3, Trash2, Key } from "lucide-react-native";
import { fetchListingById, deleteListing } from "../../src/api/listings";
import { LoadingView } from "../../src/components/LoadingView";
import { ErrorView } from "../../src/components/ErrorView";
import { useAuth } from "../../src/context/AuthContext";

export default function VehicleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [snackMsg, setSnackMsg] = useState("");

  const {
    data: vehicle,
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
      queryClient.invalidateQueries({ queryKey: ["listings", "vehicle"] });
      router.back();
    },
    onError: (err: any) => {
      Alert.alert("Delete Failed", err.response?.data?.error || "Could not delete vehicle listing.");
    },
  });

  const isOwner = user && vehicle && user.id === vehicle.ownerId;

  const handleDelete = () => {
    Alert.alert(
      "Delete Vehicle Listing",
      "Are you sure you want to delete this vehicle listing?",
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

  const handleBookingRequest = () => {
    setSnackMsg(`Rental request sent to ${vehicle?.ownerName}. You will receive a notification upon approval.`);
  };

  if (isLoading) return <LoadingView message="Loading vehicle details..." />;
  if (isError || !vehicle) {
    return (
      <ErrorView
        message={(error as any)?.message || "Vehicle not found."}
        onRetry={() => refetch()}
      />
    );
  }

  const isAvailable = vehicle.vehicleDetails?.available ?? true;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Main Price & Status Card */}
        <Surface style={styles.card} elevation={1}>
          <View style={styles.priceRow}>
            <Text variant="headlineSmall" style={styles.priceText}>
              ₹{vehicle.vehicleDetails?.rentalPrice || 0}
              <Text variant="titleMedium" style={styles.periodText}>
                /{vehicle.vehicleDetails?.pricingPeriod || "hour"}
              </Text>
            </Text>

            <Chip
              style={{
                backgroundColor: isAvailable ? "#ECFDF5" : "#FEF2F2",
              }}
              textStyle={{
                color: isAvailable ? "#059669" : "#DC2626",
                fontWeight: "700",
              }}
            >
              {isAvailable ? "Available Now" : "Currently Booked"}
            </Chip>
          </View>

          <Text variant="headlineSmall" style={styles.title}>
            {vehicle.title}
          </Text>

          <View style={styles.metaRow}>
            <View style={styles.typeTag}>
              <Bike size={14} color="#D97706" />
              <Text variant="labelMedium" style={styles.typeText}>
                {vehicle.vehicleDetails?.vehicleType || "Bike"}
              </Text>
            </View>

            <View style={styles.locationTag}>
              <MapPin size={14} color="#64748B" />
              <Text variant="bodySmall" style={styles.locationText}>
                {vehicle.locality}
              </Text>
            </View>
          </View>
        </Surface>

        {/* Description Section */}
        <Surface style={styles.card} elevation={1}>
          <Text variant="titleMedium" style={styles.sectionHeading}>
            Vehicle Details & Conditions
          </Text>
          <Text variant="bodyMedium" style={styles.desc}>
            {vehicle.description || "Well maintained vehicle. Helmet and documents provided upon pickup."}
          </Text>
        </Surface>

        {/* Owner Information */}
        <Surface style={styles.card} elevation={1}>
          <Text variant="titleMedium" style={styles.sectionHeading}>
            Vehicle Owner
          </Text>
          <View style={styles.ownerRow}>
            <View style={styles.ownerAvatar}>
              <User size={24} color="#D97706" />
            </View>
            <View>
              <Text variant="titleSmall" style={styles.ownerName}>
                {vehicle.ownerName}
              </Text>
              <Text variant="bodySmall" style={styles.ownerSub}>
                Verified Vehicle Host · LocalConnect
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
                icon={() => <Edit3 size={16} color="#D97706" />}
                onPress={() => router.push(`/vehicles/create?id=${vehicle.id}`)}
                style={styles.editBtn}
                textColor="#D97706"
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
            icon={() => <Key size={18} color="#FFFFFF" />}
            onPress={handleBookingRequest}
            disabled={!isAvailable}
            style={styles.bookBtn}
            buttonColor="#D97706"
          >
            {isAvailable ? "Request Rental" : "Currently Unavailable"}
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
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  priceText: {
    fontWeight: "900",
    color: "#D97706",
  },
  periodText: {
    color: "#64748B",
    fontWeight: "400",
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
  typeTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeText: {
    color: "#92400E",
    fontWeight: "700",
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
    backgroundColor: "#FEF3C7",
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
    borderColor: "#D97706",
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
