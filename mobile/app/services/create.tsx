import React, { useState, useEffect } from "react";
import { StyleSheet, View, ScrollView, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { Text, TextInput, Button, Surface, Chip, Switch } from "react-native-paper";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createListing, fetchListingById, updateListing } from "../../src/api/listings";
import { useAuth } from "../../src/context/AuthContext";
import { LoadingView } from "../../src/components/LoadingView";

const SERVICE_CATEGORIES = ["Electrician", "Mechanic", "Plumber", "Notes", "Other"] as const;

export default function CreateServiceScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [serviceCategory, setServiceCategory] = useState<(typeof SERVICE_CATEGORIES)[number]>("Electrician");
  const [pricingInfo, setPricingInfo] = useState("");
  const [locality, setLocality] = useState(user?.area || "");
  const [description, setDescription] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const { data: existingService, isLoading: isLoadingExisting } = useQuery({
    queryKey: ["listing", id],
    queryFn: () => fetchListingById(id!),
    enabled: isEditing,
  });

  useEffect(() => {
    if (existingService) {
      setTitle(existingService.title);
      setServiceCategory((existingService.serviceDetails?.serviceCategory as any) || "Electrician");
      setPricingInfo(existingService.serviceDetails?.pricingInfo || "");
      setLocality(existingService.locality);
      setDescription(existingService.description || "");
      setIsAvailable(existingService.serviceDetails?.available ?? true);
    }
  }, [existingService]);

  const mutation = useMutation({
    mutationFn: (payload: any) =>
      isEditing ? updateListing(id!, payload) : createListing(payload),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["listings", "service"] });
      queryClient.invalidateQueries({ queryKey: ["listing", saved.id] });
      Alert.alert(
        "Success",
        isEditing ? "Service listing updated!" : "Service profile listed for the community!",
        [{ text: "OK", onPress: () => router.back() }]
      );
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || err.message || "Failed to save service listing.";
      setErrorMsg(msg);
    },
  });

  const handleSubmit = () => {
    if (!title.trim() || !pricingInfo.trim() || !locality.trim()) {
      setErrorMsg("Please fill in service name/provider, pricing info, and service area.");
      return;
    }
    setErrorMsg("");

    const payload = {
      type: "service",
      title: title.trim(),
      locality: locality.trim(),
      description: description.trim(),
      serviceDetails: {
        serviceCategory,
        pricingInfo: pricingInfo.trim(),
        rating: isEditing ? existingService?.serviceDetails?.rating || 5.0 : 5.0,
        jobsCount: isEditing ? existingService?.serviceDetails?.jobsCount || 0 : 0,
        available: isAvailable,
      },
    };

    mutation.mutate(payload);
  };

  if (isEditing && isLoadingExisting) {
    return <LoadingView message="Loading service data..." />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Surface style={styles.card} elevation={1}>
          <Text variant="headlineSmall" style={styles.formTitle}>
            {isEditing ? "Edit Service Listing" : "Offer a Service"}
          </Text>
          <Text variant="bodySmall" style={styles.formSubtitle}>
            List your skills, plumbing, electricals, mechanics or notes for people nearby
          </Text>

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Text variant="bodySmall" style={styles.errorText}>
                {errorMsg}
              </Text>
            </View>
          ) : null}

          <TextInput
            label="Service / Provider Name *"
            value={title}
            onChangeText={(t) => {
              setTitle(t);
              setErrorMsg("");
            }}
            placeholder="e.g. Sanjay Electricals, Raju Auto Works"
            mode="outlined"
            style={styles.input}
          />

          <Text variant="titleSmall" style={styles.sectionLabel}>
            Trade Category
          </Text>
          <View style={styles.chipsRow}>
            {SERVICE_CATEGORIES.map((cat) => {
              const isSelected = serviceCategory === cat;
              return (
                <Chip
                  key={cat}
                  selected={isSelected}
                  onPress={() => setServiceCategory(cat)}
                  style={[styles.chip, isSelected && styles.selectedChip]}
                  textStyle={isSelected ? styles.selectedChipText : styles.chipText}
                >
                  {cat}
                </Chip>
              );
            })}
          </View>

          <TextInput
            label="Pricing Information *"
            value={pricingInfo}
            onChangeText={(t) => {
              setPricingInfo(t);
              setErrorMsg("");
            }}
            placeholder="e.g. from ₹150, ₹199 per pack"
            mode="outlined"
            style={styles.input}
          />

          <TextInput
            label="Service Area / Locality *"
            value={locality}
            onChangeText={(t) => {
              setLocality(t);
              setErrorMsg("");
            }}
            placeholder="e.g. Sector 1 to 5, University Hostel Zone"
            mode="outlined"
            style={styles.input}
          />

          <View style={styles.switchRow}>
            <View style={styles.switchTextContainer}>
              <Text variant="titleSmall" style={styles.switchTitle}>
                Available for New Jobs
              </Text>
              <Text variant="bodySmall" style={styles.switchSub}>
                Show customers that you are ready to take requests today
              </Text>
            </View>
            <Switch value={isAvailable} onValueChange={setIsAvailable} color="#059669" />
          </View>

          <TextInput
            label="Experience & Service Details"
            value={description}
            onChangeText={setDescription}
            placeholder="Mention years of experience, tools available, working hours, etc."
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
            buttonColor="#059669"
          >
            {isEditing ? "Update Service Listing" : "Publish Service"}
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
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    backgroundColor: "#F1F5F9",
  },
  selectedChip: {
    backgroundColor: "#D1FAE5",
  },
  chipText: {
    color: "#475569",
    fontSize: 12,
  },
  selectedChipText: {
    color: "#065F46",
    fontWeight: "700",
    fontSize: 12,
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
