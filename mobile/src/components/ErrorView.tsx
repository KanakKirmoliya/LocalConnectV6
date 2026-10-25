import React from "react";
import { StyleSheet, View } from "react-native";
import { Text, Button } from "react-native-paper";
import { AlertCircle } from "lucide-react-native";

interface ErrorViewProps {
  message?: string;
  onRetry?: () => void;
}

export const ErrorView: React.FC<ErrorViewProps> = ({
  message = "Failed to load data. Please check connection and try again.",
  onRetry,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <AlertCircle size={36} color="#DC2626" />
      </View>
      <Text variant="titleMedium" style={styles.title}>
        Something went wrong
      </Text>
      <Text variant="bodyMedium" style={styles.message}>
        {message}
      </Text>
      {onRetry && (
        <Button mode="contained" onPress={onRetry} style={styles.button} buttonColor="#2563EB">
          Try Again
        </Button>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#F8FAFC",
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  title: {
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
  },
  message: {
    color: "#64748B",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
    maxWidth: 280,
  },
  button: {
    borderRadius: 8,
    paddingHorizontal: 12,
  },
});
