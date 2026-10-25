import React from "react";
import { StyleSheet, View, ScrollView } from "react-native";
import { Text, Avatar, Surface, Button, Divider, List, Chip } from "react-native-paper";
import { useRouter } from "expo-router";
import { User, Mail, MapPin, Shield, LogOut, LogIn } from "lucide-react-native";
import { useAuth } from "../src/context/AuthContext";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();

  if (!user) {
    return (
      <View style={styles.centerContainer}>
        <Surface style={styles.loginPromptCard} elevation={1}>
          <User size={48} color="#94A3B8" />
          <Text variant="titleMedium" style={styles.loginPromptTitle}>
            You are not logged in
          </Text>
          <Text variant="bodySmall" style={styles.loginPromptDesc}>
            Log in to manage your listings, inquiries, and profile.
          </Text>
          <Button
            mode="contained"
            icon={() => <LogIn size={16} color="#FFFFFF" />}
            onPress={() => router.push("/(auth)/login")}
            style={styles.actionBtn}
            buttonColor="#2563EB"
          >
            Log In / Sign Up
          </Button>
        </Surface>
      </View>
    );
  }

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {/* Header Profile Surface */}
      <Surface style={styles.profileHeader} elevation={1}>
        <Avatar.Text
          size={72}
          label={user.name.slice(0, 2).toUpperCase()}
          style={styles.avatar}
        />
        <Text variant="headlineSmall" style={styles.userName}>
          {user.name}
        </Text>
        <Text variant="bodyMedium" style={styles.userEmail}>
          {user.email}
        </Text>

        <View style={styles.badgeRow}>
          <Chip
            icon={() => <Shield size={14} color="#2563EB" />}
            style={styles.roleChip}
            textStyle={styles.roleText}
          >
            {user.role === "admin" ? "Platform Admin" : "Verified User"}
          </Chip>
          {user.area ? (
            <Chip
              icon={() => <MapPin size={14} color="#059669" />}
              style={styles.areaChip}
              textStyle={styles.areaText}
            >
              {user.area}
            </Chip>
          ) : null}
        </View>
      </Surface>

      {/* Account Info List */}
      <Surface style={styles.infoCard} elevation={1}>
        <List.Item
          title="Full Name"
          description={user.name}
          left={(props) => <List.Icon {...props} icon={() => <User size={20} color="#64748B" />} />}
        />
        <Divider />
        <List.Item
          title="Email"
          description={user.email}
          left={(props) => <List.Icon {...props} icon={() => <Mail size={20} color="#64748B" />} />}
        />
        <Divider />
        <List.Item
          title="Area"
          description={user.area || "Not specified"}
          left={(props) => <List.Icon {...props} icon={() => <MapPin size={20} color="#64748B" />} />}
        />
      </Surface>

      {/* Logout Action */}
      <Button
        mode="contained"
        onPress={() => router.push("/requests")}
        style={styles.requestsBtn}
        buttonColor="#2563EB"
      >
        My Inquiries & Requests
      </Button>

      <Button
        mode="outlined"
        icon={() => <LogOut size={18} color="#DC2626" />}
        onPress={handleLogout}
        loading={isLoading}
        disabled={isLoading}
        style={styles.logoutBtn}
        textColor="#DC2626"
      >
        Log Out
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#F8FAFC",
  },
  loginPromptCard: {
    padding: 24,
    borderRadius: 16,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    width: "100%",
    maxWidth: 320,
  },
  loginPromptTitle: {
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 12,
    marginBottom: 6,
  },
  loginPromptDesc: {
    color: "#64748B",
    textAlign: "center",
    marginBottom: 20,
  },
  actionBtn: {
    width: "100%",
    borderRadius: 8,
  },
  profileHeader: {
    alignItems: "center",
    padding: 24,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    marginBottom: 16,
  },
  avatar: {
    backgroundColor: "#2563EB",
    marginBottom: 14,
  },
  userName: {
    fontWeight: "800",
    color: "#0F172A",
  },
  userEmail: {
    color: "#64748B",
    marginTop: 2,
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  roleChip: {
    backgroundColor: "#EFF6FF",
  },
  roleText: {
    color: "#1E40AF",
    fontWeight: "600",
    fontSize: 12,
  },
  areaChip: {
    backgroundColor: "#ECFDF5",
  },
  areaText: {
    color: "#065F46",
    fontWeight: "600",
    fontSize: 12,
  },
  infoCard: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    marginBottom: 24,
    overflow: "hidden",
  },
  logoutBtn: {
    borderColor: "#FCA5A5",
    borderRadius: 10,
    paddingVertical: 4,
  },
  requestsBtn: {
    borderRadius: 10,
    marginBottom: 12,
    paddingVertical: 4,
  },
});
