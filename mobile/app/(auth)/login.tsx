import React, { useState } from "react";
import { StyleSheet, View, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from "react-native";
import { Text, TextInput, Button, Surface, HelperText } from "react-native-paper";
import { useRouter } from "expo-router";
import { LogIn, Lock, Mail } from "lucide-react-native";
import { useAuth } from "../../src/context/AuthContext";

export default function LoginScreen() {
  const router = useRouter();
  const { login, isLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secureText, setSecureText] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setErrorMsg("Please fill in both email and password.");
      return;
    }
    setErrorMsg("");

    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || "Failed to log in. Please try again.";
      setErrorMsg(msg);
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
            <LogIn size={36} color="#2563EB" />
          </View>
          <Text variant="headlineSmall" style={styles.title}>
            Welcome Back
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Log in to manage your listings and contact owners
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
            label="Email Address"
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

          <TextInput
            label="Password"
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
            onPress={handleLogin}
            loading={isLoading}
            disabled={isLoading}
            style={styles.loginBtn}
            buttonColor="#2563EB"
          >
            Log In
          </Button>
        </Surface>

        <View style={styles.footerRow}>
          <Text variant="bodyMedium" style={styles.footerText}>
            Don't have an account?
          </Text>
          <TouchableOpacity onPress={() => router.push("/(auth)/signup")}>
            <Text variant="bodyMedium" style={styles.signupLink}>
              Sign Up
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
    marginBottom: 24,
  },
  logoCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
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
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
  },
  loginBtn: {
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
    marginBottom: 16,
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
  signupLink: {
    color: "#2563EB",
    fontWeight: "700",
  },
});
