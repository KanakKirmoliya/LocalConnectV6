import React, { useState, useEffect } from "react";
import { StyleSheet, View, ScrollView, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { Text, TextInput, Button, Surface, SegmentedButtons } from "react-native-paper";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createListing, fetchListingById, updateListing } from "../../src/api/listings";
import { useAuth } from "../../src/context/AuthContext";
import { LoadingView } from "../../src/components/LoadingView";

export default function CreateLostFoundScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<"found" | "lost">("found");
  const [title, setTitle] = useState("");
  const [locality, setLocality] = useState(user?.area || "");
  const [description, setDescription] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const { data: existingItem, isLoading: isLoadingExisting } = useQuery({
    queryKey: ["listing", id],
    queryFn: () => fetchListingById(id!),
    enabled: isEditing,
  });

  useEffect(() => {
    if (existingItem) {
      setTitle(existingItem.title);
      setKind(existingItem.lostFoundDetails?.kind || "found");
      setLocality(existingItem.locality);
      setDescription(existingItem.description || "");
    }
  }, [existingItem]);

  const mutation = useMutation({
    mutationFn: (payload: any) =>
      isEditing ? updateListing(id!, payload) : createListing(payload),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["listings", "lost_found"] });
      queryClient.invalidateQueries({ queryKey: ["listing", saved.id] });
      Alert.alert(
        "Success",
        isEditing ? "Report updated successfully!" : "Report published to the community!",
        [{ text: "OK", onPress: () => router.back() }]
      );
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || err.message || "Failed to submit report.";
      setErrorMsg(msg);
    },
  });

  const handleSubmit = () => {
    if (!title.trim() || !locality.trim()) {
      setErrorMsg("Please fill in the item title and the locality where it was lost/found.");
      return;
    }
    setErrorMsg("");

    const payload = {
      type: "lost_found",
      title: title.trim(),
      locality: locality.trim(),
      description: description.trim(),
      lostFoundDetails: {
        kind,
        itemName: title.trim(),
        incidentDate: new Date().toISOString(),
      },
    };

    mutation.mutate(payload);
  };

  if (isEditing && isLoadingExisting) {
    return <LoadingView message="Loading report data..." />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Surface style={styles.card} elevation={1}>
          <Text variant="headlineSmall" style={styles.formTitle}>
            {isEditing ? "Edit Report" : "Report an Item"}
          </Text>
          <Text variant="bodySmall" style={styles.formSubtitle}>
            Notify nearby people to help retrieve lost belongings
          </Text>

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Text variant="bodySmall" style={styles.errorText}>
                {errorMsg}
              </Text>
            </View>
          ) : null}

          <Text variant="titleSmall" style={styles.sectionLabel}>
            Report Type
          </Text>
          <SegmentedButtons
            value={kind}
            onValueChange={(val) => setKind(val as "found" | "lost")}
            buttons={[
              { value: "found", label: "I Found Something" },
              { value: "lost", label: "I Lost Something" },
            ]}
            style={styles.segmented}
          />

          <TextInput
            label="Item Title *"
            value={title}
            onChangeText={(t) => {
              setTitle(t);
              setErrorMsg("");
            }}
            placeholder={
              kind === "found"
                ? "e.g. Black leather wallet with student ID"
                : "e.g. Silver keychain with 3 keys"
            }
            mode="outlined"
            style={styles.input}
          />

          <TextInput
            label="Where Was It Lost / Found? *"
            value={locality}
            onChangeText={(t) => {
              setLocality(t);
              setErrorMsg("");
            }}
            placeholder="e.g. Library 2nd floor, Canteen corner"
            mode="outlined"
            style={styles.input}
          />

          <TextInput
            label="Description & Identification Clues"
            value={description}
            onChangeText={setDescription}
            placeholder={
              kind === "found"
                ? "Describe where it was found and where the owner can collect it..."
                : "Describe unique marks or contents that prove ownership..."
            }
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
            buttonColor={kind === "lost" ? "#DC2626" : "#0284C7"}
          >
            {isEditing ? "Update Report" : "Publish Report"}
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
  sectionLabel: {
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
  },
  segmented: {
    marginBottom: 16,
  },
  input: {
    marginBottom: 14,
    backgroundColor: "#FFFFFF",
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
