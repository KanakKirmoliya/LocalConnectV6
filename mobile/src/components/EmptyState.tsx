import React from "react";
import { StyleSheet, View } from "react-native";
import { Text, Button } from "react-native-paper";
import { Inbox } from "lucide-react-native";

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = "No Listings Found",
  description = "No items match your current category or filters in this area.",
  actionLabel,
  onAction,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Inbox size={38} color="#94A3B8" />
      </View>
      <Text variant="titleMedium" style={styles.title}>
        {title}
      </Text>
      <Text variant="bodySmall" style={styles.desc}>
        {description}
      </Text>
      {actionLabel && onAction ? (
        <Button mode="outlined" onPress={onAction} style={styles.btn} textColor="#2563EB">
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 6,
  },
  desc: {
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 16,
    maxWidth: 260,
  },
  btn: {
    borderColor: "#2563EB",
    borderRadius: 8,
  },
});
