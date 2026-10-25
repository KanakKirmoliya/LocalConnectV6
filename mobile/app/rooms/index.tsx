import React, { useState } from "react";
import { StyleSheet, View, FlatList, RefreshControl } from "react-native";
import { Text, Chip, FAB, Searchbar, TextInput } from "react-native-paper";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react-native";
import { fetchListings } from "../../src/api/listings";
import { ListingCard } from "../../src/components/ListingCard";
import { LoadingView } from "../../src/components/LoadingView";
import { ErrorView } from "../../src/components/ErrorView";
import { EmptyState } from "../../src/components/EmptyState";
import { useAuth } from "../../src/context/AuthContext";

export default function RoomsListScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [maxRent, setMaxRent] = useState<number | undefined>(undefined);
  const [minRent, setMinRent] = useState("");
  const [roomType, setRoomType] = useState("");
  const [amenity, setAmenity] = useState("");
  const [availableFrom, setAvailableFrom] = useState("");

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["listings", "room", maxRent, minRent, search, roomType, amenity, availableFrom],
    queryFn: () =>
      fetchListings({
        type: "room",
        maxRent,
        minRent: minRent ? Number(minRent) : undefined,
        roomType: roomType || undefined,
        amenity: amenity || undefined,
        availableFrom: availableFrom || undefined,
        search: search.trim() || undefined,
      }),
  });

  const rooms = data?.data || [];

  if (isLoading) {
    return <LoadingView message="Finding available rooms..." />;
  }

  if (isError) {
    return (
      <ErrorView
        message={(error as any)?.message || "Failed to load room listings."}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search rooms, localities..."
          value={search}
          onChangeText={setSearch}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
        />
      </View>

      <View style={styles.filterRow}>
        {["", "Single", "1RK", "1BHK", "2BHK", "Shared", "PG"].map((value) => (
          <Chip key={value || "all-types"} selected={roomType === value} onPress={() => setRoomType(value)} style={styles.filterChip}>
            {value || "All types"}
          </Chip>
        ))}
      </View>
      <View style={styles.dateFilter}>
        <TextInput
          label="Minimum rent (₹)"
          value={minRent}
          onChangeText={setMinRent}
          keyboardType="numeric"
          mode="outlined"
          style={styles.minRentInput}
        />
        <TextInput
          label="Available by (YYYY-MM-DD)"
          value={availableFrom}
          onChangeText={setAvailableFrom}
          mode="outlined"
          style={styles.dateInput}
        />
      </View>
      <View style={styles.filterRow}>
        {["", "WiFi", "Attached Bath", "Water 24x7", "AC", "Geyser", "Power Backup"].map((value) => (
          <Chip key={value || "any-amenity"} selected={amenity === value} onPress={() => setAmenity(value)} style={styles.filterChip}>
            {value || "Any amenity"}
          </Chip>
        ))}
      </View>

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        <Chip
          selected={maxRent === undefined}
          onPress={() => setMaxRent(undefined)}
          style={styles.filterChip}
        >
          All Rent
        </Chip>
        <Chip
          selected={maxRent === 5000}
          onPress={() => setMaxRent(maxRent === 5000 ? undefined : 5000)}
          style={styles.filterChip}
        >
          Under ₹5,000
        </Chip>
        <Chip
          selected={maxRent === 8000}
          onPress={() => setMaxRent(maxRent === 8000 ? undefined : 8000)}
          style={styles.filterChip}
        >
          Under ₹8,000
        </Chip>
        <Chip
          selected={maxRent === 12000}
          onPress={() => setMaxRent(maxRent === 12000 ? undefined : 12000)}
          style={styles.filterChip}
        >
          Under ₹12,000
        </Chip>
      </View>

      {/* Room Listings FlatList */}
      <FlatList
        data={rooms}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            onPress={() => router.push(`/rooms/${item.id}`)}
          />
        )}
        contentContainerStyle={rooms.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <EmptyState
            title="No Rooms Found"
            description="No room listings match your search or price criteria."
            actionLabel="List a Room"
            onAction={() => {
              if (!user) router.push("/(auth)/login");
              else router.push("/rooms/create");
            }}
          />
        }
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={["#2563EB"]} />
        }
      />

      {/* Create Room FAB */}
      <FAB
        icon={() => <Plus size={24} color="#FFFFFF" />}
        style={styles.fab}
        color="#FFFFFF"
        onPress={() => {
          if (!user) {
            router.push("/(auth)/login");
          } else {
            router.push("/rooms/create");
          }
        }}
        label="List a Room"
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
    flexWrap: "wrap",
  },
  dateFilter: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  minRentInput: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  dateInput: {
    flex: 1.4,
    backgroundColor: "#FFFFFF",
  },
  filterChip: {
    backgroundColor: "#FFFFFF",
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
    backgroundColor: "#2563EB",
    borderRadius: 28,
  },
});
