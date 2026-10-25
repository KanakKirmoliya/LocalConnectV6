import React from "react";
import { StyleSheet, View, TouchableOpacity } from "react-native";
import { Text, Surface } from "react-native-paper";
import { LucideIcon } from "lucide-react-native";

interface CategoryCardProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  color: string;
  countLabel?: string;
  onPress: () => void;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({
  title,
  subtitle,
  icon: Icon,
  color,
  countLabel,
  onPress,
}) => {
  return (
    <Surface style={[styles.surface, { borderLeftColor: color }]} elevation={2}>
      <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.container}>
        <View style={[styles.iconContainer, { backgroundColor: `${color}18` }]}>
          <Icon size={26} color={color} />
        </View>

        <View style={styles.textContainer}>
          <View style={styles.titleRow}>
            <Text variant="titleMedium" style={styles.title}>
              {title}
            </Text>
            {countLabel && (
              <View style={[styles.badge, { backgroundColor: `${color}20` }]}>
                <Text variant="labelSmall" style={{ color, fontWeight: "700" }}>
                  {countLabel}
                </Text>
              </View>
            )}
          </View>
          <Text variant="bodySmall" style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
      </TouchableOpacity>
    </Surface>
  );
};

const styles = StyleSheet.create({
  surface: {
    borderRadius: 14,
    marginVertical: 7,
    marginHorizontal: 16,
    borderLeftWidth: 5,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  textContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: {
    fontWeight: "700",
    color: "#0F172A",
  },
  subtitle: {
    color: "#64748B",
    lineHeight: 18,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
});
