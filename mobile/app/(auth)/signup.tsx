import React, { useState } from "react";
import { StyleSheet, View, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { Text, TextInput, Button, Surface, HelperText } from "react-native-paper";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { UserPlus, User, Mail, Lock, MapPin, LocateFixed } from "lucide-react-native";
import { useAuth } from "../../src/context/AuthContext";

export default function SignupScreen() {
  const router = useRouter();
  const { signup, isLoading } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [area, setArea] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [secureText, setSecureText] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !password) {
      setErrorMsg("Please fill in your name, email, and password.");
      return;
    }
    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }
    setErrorMsg("");

    try {
      await signup(name.trim(), email.trim(), password, area.trim());
      router.replace("/");
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || "Signup failed. Try again.";
      setErrorMsg(msg);
    }
  };

  const detectLocation = async () => {
    setIsLocating(true);
    setErrorMsg("");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location Permission",
          "Location permission was not granted. You can still type your locality manually below."
        );
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const [place] = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      if (place) {
        const areaComponents = [
          place.subregion || place.district,
          place.city,
        ].filter(Boolean);
        const detected = areaComponents.length > 0 ? areaComponents.join(", ") : place.name || "Detected Area";
        setArea(detected);
      }
    } catch (err: any) {
      Alert.alert(
        "Location Unavailable",
        "Could not automatically detect GPS location. Please enter your area manually."
      );
    } finally {
      setIsLocating(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.keyboardView}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topSection}>
          <View style={styles.logoCircle}>
            <UserPlus size={36} color="#2563EB" />
          </View>
          <Text variant="headlineSmall" style={styles.title}>
            Join LocalConnect
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Create an account to post listings and connect locally
          </Text>
        </View>

        <Surface style={styles.card} elevation={1}>
          {errorMsg ? (
            <View style={styles.errorBox}>
              <Text variant="bodySmall" style={styles.errorText}>
                {errorMsg}
              </Text>
            </View>
          ) : null}

          <TextInput
            label="Full Name *"
            value={name}
            onChangeText={(txt) => {
              setName(txt);
              setErrorMsg("");
            }}
            left={<TextInput.Icon icon={() => <User size={18} color="#64748B" />} />}
            mode="outlined"
            style={styles.input}
          />

          <TextInput
            label="Email Address *"
            value={email}
            onChangeText={(txt) => {
              setEmail(txt);
              setErrorMsg("");
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            left={<TextInput.Icon icon={() => <Mail size={18} color="#64748B" />} />}
            mode="outlined"
            style={styles.input}
          />

          {/* Area Input with GPS Auto-Detect Button */}
          <View style={styles.areaContainer}>
            <TextInput
              label="Locality / Campus Area"
              value={area}
              onChangeText={setArea}
              placeholder="e.g. North Campus, Sector 4"
              left={<TextInput.Icon icon={() => <MapPin size={18} color="#64748B" />} />}
              mode="outlined"
              style={[styles.input, { marginBottom: 4 }]}
            />

            <Button
              mode="text"
              icon={() => <LocateFixed size={16} color="#2563EB" />}
              onPress={detectLocation}
              loading={isLocating}
              disabled={isLocating}
              textColor="#2563EB"
              style={styles.gpsBtn}
              compact
            >
              {isLocating ? "Fetching GPS Location..." : "Auto-detect with GPS (or edit manually)"}
            </Button>
          </View>

          <TextInput
            label="Password (min 6 chars) *"
            value={password}
            onChangeText={(txt) => {
              setPassword(txt);
              setErrorMsg("");
            }}
            secureTextEntry={secureText}
            left={<TextInput.Icon icon={() => <Lock size={18} color="#64748B" />} />}
            right={
              <TextInput.Icon
                icon={secureText ? "eye" : "eye-off"}
                onPress={() => setSecureText(!secureText)}
              />
            }
            mode="outlined"
            style={styles.input}
          />

          <Button
            mode="contained"
            onPress={handleSignup}
            loading={isLoading}
            disabled={isLoading}
            style={styles.submitBtn}
            buttonColor="#2563EB"
          >
            Create Account
          </Button>
        </Surface>

        <View style={styles.footerRow}>
          <Text variant="bodyMedium" style={styles.footerText}>
            Already have an account?
          </Text>
          <TouchableOpacity onPress={() => router.push("/(auth)/login")}>
            <Text variant="bodyMedium" style={styles.loginLink}>
              Log In
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scroll: {
    padding: 24,
    justifyContent: "center",
    minHeight: "100%",
  },
  topSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  logoCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  title: {
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 6,
  },
  subtitle: {
    color: "#64748B",
    textAlign: "center",
  },
  card: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    marginBottom: 20,
  },
  input: {
    marginBottom: 14,
    backgroundColor: "#FFFFFF",
  },
  areaContainer: {
    marginBottom: 10,
  },
  gpsBtn: {
    alignSelf: "flex-start",
    marginTop: -2,
    marginBottom: 8,
  },
  submitBtn: {
    borderRadius: 10,
    paddingVertical: 4,
    marginTop: 8,
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
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  footerText: {
    color: "#64748B",
  },
  loginLink: {
    color: "#2563EB",
    fontWeight: "700",
  },
});
