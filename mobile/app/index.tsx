import React from "react";
import { StyleSheet, View, ScrollView, SafeAreaView, TouchableOpacity } from "react-native";
import { Text, Avatar, Chip, Surface, Button } from "react-native-paper";
import { useRouter } from "expo-router";
import { Home as HomeIcon, Search, Bike, Wrench, MapPin, User, LogIn, Plus } from "lucide-react-native";
import { CategoryCard } from "../src/components/CategoryCard";
import { useAuth } from "../src/context/AuthContext";

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Top Header */}
        <View style={styles.header}>
          <View>
            <Text variant="headlineSmall" style={styles.brandTitle}>
              LocalConnect
            </Text>
            <Text variant="bodySmall" style={styles.brandSubtitle}>
              Your campus & neighborhood marketplace
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push(user ? "/profile" : "/(auth)/login")}
            style={styles.profileBtn}
          >
            {user ? (
              <Avatar.Text
                size={40}
                label={user.name.slice(0, 2).toUpperCase()}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.loginIconBox}>
                <LogIn size={20} color="#2563EB" />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Location chip (Future-ready entry point) */}
        <View style={styles.locationContainer}>
          <Chip
            icon={() => <MapPin size={14} color="#2563EB" />}
            style={styles.locationChip}
            textStyle={styles.locationText}
          >
            {user?.area ? `Current Area: ${user.area}` : "Campus / North Gate Area"}
          </Chip>
        </View>

        {/* Notice Banner */}
        <Surface style={styles.banner} elevation={0}>
          <Text variant="titleSmall" style={styles.bannerTitle}>
            Hyperlocal Community Hub
          </Text>
          <Text variant="bodySmall" style={styles.bannerDesc}>
            Discover verified room rentals, rent bikes & cars, report lost items, or hire local technicians in one place.
          </Text>
        </Surface>

        {/* Four Distinct Marketplace Categories */}
        <View style={styles.sectionHeader}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Marketplace Categories
          </Text>
          <Text variant="bodySmall" style={styles.sectionHint}>
            Browse independent sections
          </Text>
        </View>

        {/* 1. Room Rent */}
        <CategoryCard
          title="Room Rent"
          subtitle="Single rooms, PGs, shared flats & student hostels"
          icon={HomeIcon}
          color="#2563EB"
          countLabel="Explore Rooms"
          onPress={() => router.push("/rooms")}
        />

        {/* 2. Lost & Found */}
        <CategoryCard
          title="Lost & Found"
          subtitle="Report missing belongings or find your lost items"
          icon={Search}
          color="#DC2626"
          countLabel="Search Items"
          onPress={() => router.push("/lost-found")}
        />

        {/* 3. Vehicle Rent */}
        <CategoryCard
          title="Vehicle Rent"
          subtitle="Scooties, bikes & cars on hourly or daily rent"
          icon={Bike}
          color="#D97706"
          countLabel="Find Vehicles"
          onPress={() => router.push("/vehicles")}
        />

        {/* 4. Civil Help / Local Services */}
        <CategoryCard
          title="Civil Help / Services"
          subtitle="Electricians, plumbers, mechanics & verified notes"
          icon={Wrench}
          color="#059669"
          countLabel="Hire Services"
          onPress={() => router.push("/services")}
        />

        {/* Quick Post Prompt */}
        <View style={styles.quickPostBox}>
          <Text variant="titleSmall" style={styles.quickPostTitle}>
            Have something to offer or lost an item?
          </Text>
          <Text variant="bodySmall" style={styles.quickPostDesc}>
            Post a listing in any category. Verified owners get instant inquiries.
          </Text>
          <View style={styles.quickPostActions}>
            <Button
              mode="contained"
              icon={() => <Plus size={16} color="#FFFFFF" />}
              onPress={() => {
                if (!user) {
                  router.push("/(auth)/login");
                } else {
                  router.push("/rooms/create");
                }
              }}
              style={styles.postBtn}
              buttonColor="#2563EB"
            >
              List a Room
            </Button>
            <Button
              mode="outlined"
              onPress={() => {
                if (!user) {
                  router.push("/(auth)/login");
                } else {
                  router.push("/lost-found/create");
                }
              }}
              style={styles.reportBtn}
              textColor="#DC2626"
            >
              Report Lost/Found
            </Button>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scroll: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  brandTitle: {
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    color: "#64748B",
    marginTop: 2,
  },
  profileBtn: {
    padding: 2,
  },
  avatar: {
    backgroundColor: "#2563EB",
  },
  loginIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  locationContainer: {
    paddingHorizontal: 20,
    marginVertical: 10,
  },
  locationChip: {
    alignSelf: "flex-start",
    backgroundColor: "#EFF6FF",
    borderColor: "#DBEAFE",
    borderWidth: 1,
  },
  locationText: {
    color: "#1E40AF",
    fontSize: 12,
    fontWeight: "600",
  },
  banner: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#E0E7FF",
  },
  bannerTitle: {
    fontWeight: "700",
    color: "#3730A3",
    marginBottom: 4,
  },
  bannerDesc: {
    color: "#4338CA",
    lineHeight: 18,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionTitle: {
    fontWeight: "800",
    color: "#0F172A",
  },
  sectionHint: {
    color: "#64748B",
  },
  quickPostBox: {
    marginTop: 24,
    marginHorizontal: 16,
    padding: 18,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  quickPostTitle: {
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },
  quickPostDesc: {
    color: "#64748B",
    marginBottom: 14,
    lineHeight: 18,
  },
  quickPostActions: {
    flexDirection: "row",
    gap: 10,
  },
  postBtn: {
    flex: 1,
    borderRadius: 8,
  },
  reportBtn: {
    flex: 1,
    borderRadius: 8,
    borderColor: "#FCA5A5",
  },
});
