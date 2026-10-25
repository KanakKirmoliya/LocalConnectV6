import React, { useState } from "react";
import { StyleSheet, View, FlatList, RefreshControl, ScrollView } from "react-native";
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

const TRADES = ["All", "Electrician", "Mechanic", "Plumber", "Notes", "Other"];

export default function ServicesListScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [selectedTrade, setSelectedTrade] = useState("All");
  const [search, setSearch] = useState("");

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["listings", "service", selectedTrade, search],
    queryFn: () =>
      fetchListings({
        type: "service",
        serviceCategory: selectedTrade,
        search: search.trim() || undefined,
      }),
  });

  const services = data?.data || [];

  if (isLoading) {
    return <LoadingView message="Finding local service providers..." />;
  }

  if (isError) {
    return (
      <ErrorView
        message={(error as any)?.message || "Failed to load civil help listings."}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search electricians, plumbers, notes..."
          value={search}
          onChangeText={setSearch}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
        />
      </View>

      {/* Trade Filter Chips */}
      <View style={styles.filterWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {TRADES.map((trade) => {
            const isSelected = selectedTrade === trade;
            return (
              <Chip
                key={trade}
                selected={isSelected}
                onPress={() => setSelectedTrade(trade)}
                style={[styles.filterChip, isSelected && styles.selectedChip]}
                textStyle={isSelected ? styles.selectedChipText : styles.chipText}
              >
                {trade}
              </Chip>
            );
          })}
        </ScrollView>
      </View>

      {/* Services FlatList */}
      <FlatList
        data={services}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            onPress={() => router.push(`/services/${item.id}`)}
          />
        )}
        contentContainerStyle={services.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <EmptyState
            title="No Services Found"
            description="No local service providers match your current trade filter in this area."
            actionLabel="Offer a Service"
            onAction={() => {
              if (!user) router.push("/(auth)/login");
              else router.push("/services/create");
            }}
          />
        }
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={["#059669"]} />
        }
      />

      {/* Offer Service FAB */}
      <FAB
        icon={() => <Plus size={24} color="#FFFFFF" />}
        style={styles.fab}
        color="#FFFFFF"
        onPress={() => {
          if (!user) {
            router.push("/(auth)/login");
          } else {
            router.push("/services/create");
          }
        }}
        label="Offer Service"
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
  filterWrapper: {
    marginBottom: 6,
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    gap: 8,
  },
  filterChip: {
    backgroundColor: "#FFFFFF",
  },
  selectedChip: {
    backgroundColor: "#D1FAE5",
  },
  chipText: {
    color: "#64748B",
  },
  selectedChipText: {
    color: "#065F46",
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
    backgroundColor: "#059669",
    borderRadius: 28,
  },
});
