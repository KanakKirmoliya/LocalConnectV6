import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { MD3LightTheme, PaperProvider } from "react-native-paper";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../src/context/AuthContext";
import { SafeAreaProvider } from "react-native-safe-area-context";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#2563EB",
    secondary: "#0284C7",
    tertiary: "#E11D48",
    background: "#F8FAFC",
    surface: "#FFFFFF",
  },
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <PaperProvider theme={theme}>
          <AuthProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerStyle: {
                  backgroundColor: "#FFFFFF",
                },
                headerTintColor: "#0F172A",
                headerTitleStyle: {
                  fontWeight: "700",
                },
                headerShadowVisible: false,
                contentStyle: {
                  backgroundColor: "#F8FAFC",
                },
              }}
            >
              <Stack.Screen
                name="index"
                options={{
                  title: "LocalConnect",
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="rooms/index"
                options={{
                  title: "Room Rent",
                }}
              />
              <Stack.Screen
                name="rooms/[id]"
                options={{
                  title: "Room Details",
                }}
              />
              <Stack.Screen
                name="rooms/create"
                options={{
                  title: "List a Room",
                }}
              />
              <Stack.Screen
                name="vehicles/index"
                options={{
                  title: "Vehicle Rent",
                }}
              />
              <Stack.Screen
                name="vehicles/[id]"
                options={{
                  title: "Vehicle Details",
                }}
              />
              <Stack.Screen
                name="vehicles/create"
                options={{
                  title: "List a Vehicle",
                }}
              />
              <Stack.Screen
                name="lost-found/index"
                options={{
                  title: "Lost & Found",
                }}
              />
              <Stack.Screen
                name="lost-found/[id]"
                options={{
                  title: "Item Details",
                }}
              />
              <Stack.Screen
                name="lost-found/create"
                options={{
                  title: "Report Lost/Found",
                }}
              />
              <Stack.Screen
                name="services/index"
                options={{
                  title: "Civil Help",
                }}
              />
              <Stack.Screen
                name="services/[id]"
                options={{
                  title: "Service Details",
                }}
              />
              <Stack.Screen
                name="services/create"
                options={{
                  title: "Offer a Service",
                }}
              />
              <Stack.Screen
                name="(auth)/login"
                options={{
                  title: "Log In",
                }}
              />
              <Stack.Screen
                name="(auth)/signup"
                options={{
                  title: "Create Account",
                }}
              />
              <Stack.Screen
                name="profile"
                options={{
                  title: "My Profile",
                }}
              />
              <Stack.Screen
                name="requests"
                options={{
                  title: "My Inquiries",
                }}
              />
            </Stack>
          </AuthProvider>
        </PaperProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
