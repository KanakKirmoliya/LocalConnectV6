import React from "react";
import { StyleSheet, View, TouchableOpacity, Image } from "react-native";
import { Text, Surface, Chip } from "react-native-paper";
import { MapPin, User as UserIcon, CheckCircle2, Star, Camera, Video as VideoIcon, Navigation } from "lucide-react-native";
import { Listing } from "../types";
import { getMediaUrl } from "../api/client";

interface ListingCardProps {
  listing: Listing;
  onPress: () => void;
}

export const ListingCard: React.FC<ListingCardProps> = ({ listing, onPress }) => {
  const photos = listing.photos || [];
  const videos = listing.videos || [];
  const coverItem = photos.length > 0 ? photos[listing.coverIndex || 0] || photos[0] : null;
  const coverUrl = coverItem ? getMediaUrl(coverItem) : null;

  const renderCategoryInfo = () => {
    switch (listing.type) {
      case "room":
        return (
          <View style={styles.priceRow}>
            <Text variant="titleMedium" style={styles.priceText}>
              ₹{listing.roomDetails?.rent?.toLocaleString("en-IN") || 0}
              <Text variant="bodySmall" style={styles.periodText}>
                /{listing.roomDetails?.period || "mo"}
              </Text>
              <View style={styles.roomInfo}>
                {listing.roomDetails?.roomType ? (
                  <Text variant="labelSmall" style={styles.roomMeta}>{listing.roomDetails.roomType}</Text>
                ) : null}
                {listing.roomDetails?.deposit ? (
                  <Text variant="labelSmall" style={styles.roomMeta}>Deposit ₹{listing.roomDetails.deposit.toLocaleString("en-IN")}</Text>
                ) : null}
                {listing.roomDetails?.maintenance ? (
                  <Text variant="labelSmall" style={styles.roomMeta}>Maintenance ₹{listing.roomDetails.maintenance.toLocaleString("en-IN")}/mo</Text>
                ) : null}
              </View>
            </Text>
            {listing.roomDetails?.verified && (
              <View style={styles.verifiedBadge}>
                <CheckCircle2 size={13} color="#059669" />
                <Text variant="labelSmall" style={styles.verifiedText}>
                  Verified
                </Text>
              </View>
            )}
          </View>
        );

      case "vehicle":
        return (
          <View style={styles.priceRow}>
            <Text variant="titleMedium" style={styles.priceText}>
              ₹{listing.vehicleDetails?.rentalPrice || 0}
              <Text variant="bodySmall" style={styles.periodText}>
                /{listing.vehicleDetails?.pricingPeriod || "hr"}
              </Text>
            </Text>
            <Chip
              compact
              style={{
                backgroundColor: listing.vehicleDetails?.available ? "#ECFDF5" : "#FEF2F2",
              }}
              textStyle={{
                color: listing.vehicleDetails?.available ? "#059669" : "#DC2626",
                fontSize: 11,
                fontWeight: "600",
              }}
            >
              {listing.vehicleDetails?.available ? "Available" : "Booked"}
            </Chip>
          </View>
        );

      case "lost_found":
        const isLost = listing.lostFoundDetails?.kind === "lost";
        return (
          <View style={styles.priceRow}>
            <View
              style={[
                styles.kindBadge,
                { backgroundColor: isLost ? "#FEE2E2" : "#E0F2FE" },
              ]}
            >
              <Text
                variant="labelMedium"
                style={{
                  color: isLost ? "#B91C1C" : "#0369A1",
                  fontWeight: "700",
                  textTransform: "uppercase",
                }}
              >
                {isLost ? "Lost Item" : "Found Item"}
              </Text>
            </View>
          </View>
        );

      case "service":
        return (
          <View style={styles.priceRow}>
            <Text variant="titleMedium" style={styles.priceText}>
              {listing.serviceDetails?.pricingInfo || "Call for quote"}
            </Text>
            <View style={styles.ratingBadge}>
              <Star size={13} color="#EAB308" fill="#EAB308" />
              <Text variant="labelSmall" style={styles.ratingText}>
                {listing.serviceDetails?.rating || 5.0} (
                {listing.serviceDetails?.jobsCount || 0} jobs)
              </Text>
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <Surface style={styles.card} elevation={1}>
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        {coverUrl ? (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: coverUrl }}
              style={styles.cardImage}
              resizeMode="cover"
            />
            <View style={styles.mediaBadges}>
              {photos.length > 0 && (
                <View style={styles.mediaBadge}>
                  <Camera size={11} color="#FFFFFF" />
                  <Text style={styles.mediaBadgeText}>{photos.length}</Text>
                </View>
              )}
              {videos.length > 0 && (
                <View style={[styles.mediaBadge, { backgroundColor: "rgba(37, 99, 235, 0.85)" }]}>
                  <VideoIcon size={11} color="#FFFFFF" />
                  <Text style={styles.mediaBadgeText}>{videos.length}</Text>
                </View>
              )}
            </View>
          </View>
        ) : null}

        <View style={styles.inner}>
          <View style={styles.header}>
            <Text variant="titleMedium" style={styles.title} numberOfLines={2}>
              {listing.title}
            </Text>
            {renderCategoryInfo()}
          </View>

          {listing.description ? (
            <Text variant="bodySmall" style={styles.desc} numberOfLines={2}>
              {listing.description}
            </Text>
          ) : null}

          <View style={styles.footer}>
            <View style={styles.metaItem}>
              <MapPin size={13} color="#64748B" />
              <Text variant="labelSmall" style={styles.metaText} numberOfLines={1}>
                {listing.locality}
              </Text>
            </View>

            {listing.distanceKm !== undefined ? (
              <View style={styles.distanceBadge}>
                <Navigation size={11} color="#2563EB" />
                <Text style={styles.distanceText}>
                  {listing.distanceKm < 1
                    ? `${Math.round(listing.distanceKm * 1000)} m`
                    : `${listing.distanceKm.toFixed(1)} km`}
                </Text>
              </View>
            ) : null}

            <View style={styles.metaItem}>
              <UserIcon size={13} color="#64748B" />
              <Text variant="labelSmall" style={styles.metaText} numberOfLines={1}>
                {listing.ownerName}
              </Text>
            </View>
          </View>

          {listing.type === "room" && listing.roomDetails?.amenities?.length ? (
            <View style={styles.chipsRow}>
              {listing.roomDetails.amenities.slice(0, 3).map((amenity, i) => (
                <View key={i} style={styles.amenityChip}>
                  <Text variant="labelSmall" style={styles.amenityText}>
                    {amenity}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    </Surface>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    marginVertical: 6,
    marginHorizontal: 16,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  imageContainer: {
    position: "relative",
    width: "100%",
    height: 160,
    backgroundColor: "#E2E8F0",
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  mediaBadges: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    gap: 6,
  },
  mediaBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  mediaBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  distanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    gap: 3,
  },
  distanceText: {
    color: "#2563EB",
    fontSize: 11,
    fontWeight: "700",
  },
  inner: {
    padding: 16,
  },
  header: {
    marginBottom: 8,
  },
  title: {
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 6,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  roomInfo: {
    gap: 4,
    alignItems: "flex-end",
  },
  roomMeta: {
    color: "#64748B",
  },
  priceText: {
    fontWeight: "800",
    color: "#2563EB",
  },
  periodText: {
    fontWeight: "400",
    color: "#64748B",
  },
  desc: {
    color: "#475569",
    marginBottom: 10,
    lineHeight: 18,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 10,
    marginTop: 4,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "48%",
  },
  metaText: {
    color: "#64748B",
    marginLeft: 4,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  verifiedText: {
    color: "#059669",
    marginLeft: 4,
    fontWeight: "600",
  },
  kindBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEFCE8",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  ratingText: {
    color: "#854D0E",
    marginLeft: 4,
    fontWeight: "600",
  },
  chipsRow: {
    flexDirection: "row",
    marginTop: 8,
    flexWrap: "wrap",
    gap: 6,
  },
  amenityChip: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  amenityText: {
    color: "#475569",
    fontSize: 11,
  },
});
