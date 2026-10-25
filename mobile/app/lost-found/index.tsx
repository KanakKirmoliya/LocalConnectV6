import React, { useState } from "react";
import { StyleSheet, View, FlatList, RefreshControl } from "react-native";
import { SegmentedButtons, FAB, Searchbar } from "react-native-paper";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react-native";
import { fetchListings } from "../../src/api/listings";
import { ListingCard } from "../../src/components/ListingCard";
import { LoadingView } from "../../src/components/LoadingView";
import { ErrorView } from "../../src/components/ErrorView";
import { EmptyState } from "../../src/components/EmptyState";
import { useAuth } from "../../src/context/AuthContext";

export default function LostFoundListScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [kindTab, setKindTab] = useState<"found" | "lost">("found");
  const [search, setSearch] = useState("");

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["listings", "lost_found", kindTab, search],
    queryFn: () =>
      fetchListings({
        type: "lost_found",
        kind: kindTab,
        search: search.trim() || undefined,
      }),
  });

  const items = data?.data || [];

  if (isLoading) {
    return <LoadingView message={`Loading ${kindTab} items...`} />;
  }

  if (isError) {
    return (
      <ErrorView
        message={(error as any)?.message || "Failed to load lost & found reports."}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search lost or found items, locations..."
          value={search}
          onChangeText={setSearch}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
        />
      </View>

      {/* Distinct Found vs Lost Tabs */}
      <View style={styles.tabContainer}>
        <SegmentedButtons
          value={kindTab}
          onValueChange={(val) => setKindTab(val as "found" | "lost")}
          buttons={[
            {
              value: "found",
              label: "Found Items (Return to Owner)",
              checkedColor: "#0284C7",
            },
            {
              value: "lost",
              label: "Lost Items (Looking For)",
              checkedColor: "#DC2626",
            },
          ]}
          style={styles.segmented}
        />
      </View>

      {/* FlatList */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            onPress={() => router.push(`/lost-found/${item.id}`)}
          />
        )}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <EmptyState
            title={kindTab === "found" ? "No Found Items" : "No Lost Reports"}
            description={
              kindTab === "found"
                ? "No one has reported finding items in this area recently."
                : "No active missing reports in this area. Good news!"
            }
            actionLabel="Post a Report"
            onAction={() => {
              if (!user) router.push("/(auth)/login");
              else router.push("/lost-found/create");
            }}
          />
        }
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={["#DC2626"]} />
        }
      />

      {/* FAB */}
      <FAB
        icon={() => <Plus size={24} color="#FFFFFF" />}
        style={styles.fab}
        color="#FFFFFF"
        onPress={() => {
          if (!user) {
            router.push("/(auth)/login");
          } else {
            router.push("/lost-found/create");
          }
        }}
        label="Report Item"
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
  tabContainer: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  segmented: {
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
    backgroundColor: "#DC2626",
    borderRadius: 28,
  },
});
