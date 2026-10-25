import React, { useState, useEffect } from "react";
import { StyleSheet, View, ScrollView, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { Text, TextInput, Button, Surface, SegmentedButtons, Switch } from "react-native-paper";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createListing, fetchListingById, updateListing } from "../../src/api/listings";
import { useAuth } from "../../src/context/AuthContext";
import { LoadingView } from "../../src/components/LoadingView";

export default function CreateVehicleScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [vehicleType, setVehicleType] = useState<"Scooty" | "Bike" | "Car" | "Other">("Scooty");
  const [price, setPrice] = useState("");
  const [locality, setLocality] = useState(user?.area || "");
  const [description, setDescription] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const { data: existingVehicle, isLoading: isLoadingExisting } = useQuery({
    queryKey: ["listing", id],
    queryFn: () => fetchListingById(id!),
    enabled: isEditing,
  });

  useEffect(() => {
    if (existingVehicle) {
      setTitle(existingVehicle.title);
      setVehicleType((existingVehicle.vehicleDetails?.vehicleType as any) || "Scooty");
      setPrice(existingVehicle.vehicleDetails?.rentalPrice?.toString() || "");
      setLocality(existingVehicle.locality);
      setDescription(existingVehicle.description || "");
      setIsAvailable(existingVehicle.vehicleDetails?.available ?? true);
    }
  }, [existingVehicle]);

  const mutation = useMutation({
    mutationFn: (payload: any) =>
      isEditing ? updateListing(id!, payload) : createListing(payload),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["listings", "vehicle"] });
      queryClient.invalidateQueries({ queryKey: ["listing", saved.id] });
      Alert.alert(
        "Success",
        isEditing ? "Vehicle listing updated!" : "Vehicle published for rent!",
        [{ text: "OK", onPress: () => router.back() }]
      );
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || err.message || "Failed to save vehicle listing.";
      setErrorMsg(msg);
    },
  });

  const handleSubmit = () => {
    if (!title.trim() || !price.trim() || !locality.trim()) {
      setErrorMsg("Please fill in the vehicle model/title, hourly price, and pickup area.");
      return;
    }
    const priceNum = Number(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      setErrorMsg("Please enter a valid rental price.");
      return;
    }
    setErrorMsg("");

    const payload = {
      type: "vehicle",
      title: title.trim(),
      locality: locality.trim(),
      description: description.trim(),
      vehicleDetails: {
        vehicleType,
        rentalPrice: priceNum,
        pricingPeriod: "hour",
        available: isAvailable,
      },
    };

    mutation.mutate(payload);
  };

  if (isEditing && isLoadingExisting) {
    return <LoadingView message="Loading vehicle data..." />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Surface style={styles.card} elevation={1}>
          <Text variant="headlineSmall" style={styles.formTitle}>
            {isEditing ? "Edit Vehicle Listing" : "List a Vehicle"}
          </Text>
          <Text variant="bodySmall" style={styles.formSubtitle}>
            Rent out your scooty, bike, or car to trusted campus and local members
          </Text>

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Text variant="bodySmall" style={styles.errorText}>
                {errorMsg}
              </Text>
            </View>
          ) : null}

          <TextInput
            label="Vehicle Name & Model *"
            value={title}
            onChangeText={(t) => {
              setTitle(t);
              setErrorMsg("");
            }}
            placeholder="e.g. Honda Activa 6G, Royal Enfield 350"
            mode="outlined"
            style={styles.input}
          />

          <Text variant="titleSmall" style={styles.sectionLabel}>
            Vehicle Category
          </Text>
          <SegmentedButtons
            value={vehicleType}
            onValueChange={(val) => setVehicleType(val as any)}
            buttons={[
              { value: "Scooty", label: "Scooty" },
              { value: "Bike", label: "Bike" },
              { value: "Car", label: "Car" },
            ]}
            style={styles.segmented}
          />

          <TextInput
            label="Rental Rate per Hour (₹) *"
            value={price}
            onChangeText={(t) => {
              setPrice(t);
              setErrorMsg("");
            }}
            keyboardType="numeric"
            placeholder="e.g. 60"
            mode="outlined"
            style={styles.input}
          />

          <TextInput
            label="Pickup Locality / Area *"
            value={locality}
            onChangeText={(t) => {
              setLocality(t);
              setErrorMsg("");
            }}
            placeholder="e.g. Near Metro Station Gate 1"
            mode="outlined"
            style={styles.input}
          />

          <View style={styles.switchRow}>
            <View style={styles.switchTextContainer}>
              <Text variant="titleSmall" style={styles.switchTitle}>
                Available for Booking
              </Text>
              <Text variant="bodySmall" style={styles.switchSub}>
                Turn off when the vehicle is currently rented or undergoing service
              </Text>
            </View>
            <Switch value={isAvailable} onValueChange={setIsAvailable} color="#D97706" />
          </View>

          <TextInput
            label="Rental Conditions & Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Mention deposit required, DL requirements, helmet provided, etc."
            multiline
            numberOfLines={4}
            mode="outlined"
            style={[styles.input, styles.textArea]}
          />

          <Button
            mode="contained"
            onPress={handleSubmit}
            loading={mutation.isPending}
            disabled={mutation.isPending}
            style={styles.submitBtn}
            buttonColor="#D97706"
          >
            {isEditing ? "Update Vehicle Listing" : "Publish Vehicle"}
          </Button>
        </Surface>
      </ScrollView>
    </KeyboardAvoidingView>
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
    padding: 20,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
  },
  formTitle: {
    fontWeight: "800",
    color: "#0F172A",
  },
  formSubtitle: {
    color: "#64748B",
    marginTop: 2,
    marginBottom: 16,
  },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  errorText: {
    color: "#DC2626",
    fontWeight: "500",
  },
  input: {
    marginBottom: 14,
    backgroundColor: "#FFFFFF",
  },
  sectionLabel: {
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
  },
  segmented: {
    marginBottom: 16,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    marginBottom: 12,
  },
  switchTextContainer: {
    flex: 1,
    marginRight: 10,
  },
  switchTitle: {
    fontWeight: "700",
    color: "#0F172A",
  },
  switchSub: {
    color: "#64748B",
  },
  textArea: {
    height: 90,
  },
  submitBtn: {
    borderRadius: 10,
    paddingVertical: 4,
    marginTop: 10,
  },
});
