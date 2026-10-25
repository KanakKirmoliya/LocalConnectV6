import React, { useState } from "react";
import { StyleSheet, View, FlatList, RefreshControl } from "react-native";
import { Chip, FAB, Searchbar } from "react-native-paper";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react-native";
import { fetchListings } from "../../src/api/listings";
import { ListingCard } from "../../src/components/ListingCard";
import { LoadingView } from "../../src/components/LoadingView";
import { ErrorView } from "../../src/components/ErrorView";
import { EmptyState } from "../../src/components/EmptyState";
import { useAuth } from "../../src/context/AuthContext";

const VEHICLE_TYPES = ["All", "Scooty", "Bike", "Car"];

export default function VehiclesListScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [selectedType, setSelectedType] = useState("All");
  const [search, setSearch] = useState("");

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["listings", "vehicle", selectedType, search],
    queryFn: () =>
      fetchListings({
        type: "vehicle",
        vehicleType: selectedType,
        search: search.trim() || undefined,
      }),
  });

  const vehicles = data?.data || [];

  if (isLoading) {
    return <LoadingView message="Finding available vehicles..." />;
  }

  if (isError) {
    return (
      <ErrorView
        message={(error as any)?.message || "Failed to load vehicle rentals."}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search vehicles, models, areas..."
          value={search}
          onChangeText={setSearch}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
        />
      </View>

      {/* Vehicle Type Filter Chips */}
      <View style={styles.filterRow}>
        {VEHICLE_TYPES.map((type) => {
          const isSelected = selectedType === type;
          return (
            <Chip
              key={type}
              selected={isSelected}
              onPress={() => setSelectedType(type)}
              style={[styles.filterChip, isSelected && styles.selectedChip]}
              textStyle={isSelected ? styles.selectedChipText : styles.chipText}
            >
              {type}
            </Chip>
          );
        })}
      </View>

      {/* Vehicle Listings FlatList */}
      <FlatList
        data={vehicles}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            onPress={() => router.push(`/vehicles/${item.id}`)}
          />
        )}
        contentContainerStyle={vehicles.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <EmptyState
            title="No Vehicles Available"
            description="No bikes, scooties, or cars match your current filter in this locality."
            actionLabel="List a Vehicle"
            onAction={() => {
              if (!user) router.push("/(auth)/login");
              else router.push("/vehicles/create");
            }}
          />
        }
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={["#D97706"]} />
        }
      />

      {/* List Vehicle FAB */}
      <FAB
        icon={() => <Plus size={24} color="#FFFFFF" />}
        style={styles.fab}
        color="#FFFFFF"
        onPress={() => {
          if (!user) {
            router.push("/(auth)/login");
          } else {
            router.push("/vehicles/create");
          }
        }}
        label="List a Vehicle"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  searchBar: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    elevation: 1,
  },
  searchInput: {
    fontSize: 14,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  filterChip: {
    backgroundColor: "#FFFFFF",
  },
  selectedChip: {
    backgroundColor: "#FEF3C7",
  },
  chipText: {
    color: "#64748B",
  },
  selectedChipText: {
    color: "#B45309",
    fontWeight: "700",
  },
  listContent: {
    paddingBottom: 90,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: "center",
  },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 20,
    backgroundColor: "#D97706",
    borderRadius: 28,
  },
});
