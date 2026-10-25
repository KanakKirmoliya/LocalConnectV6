import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  TouchableOpacity,
} from "react-native";
import { Text, TextInput, Button, Surface, Chip, ActivityIndicator } from "react-native-paper";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import {
  Camera,
  Video as VideoIcon,
  Image as ImageIcon,
  MapPin,
  Trash2,
  Star,
  Compass,
} from "lucide-react-native";
import {
  createListing,
  fetchListingById,
  updateListing,
  uploadListingMedia,
} from "../../src/api/listings";
import { getMediaUrl } from "../../src/api/client";
import { useAuth } from "../../src/context/AuthContext";
import { LoadingView } from "../../src/components/LoadingView";

const AVAILABLE_AMENITIES = [
  "WiFi",
  "Water 24x7",
  "Attached Bath",
  "Furnished",
  "Mess nearby",
  "Balcony",
  "Parking",
  "CCTV",
  "Laundry",
];

interface LocalMediaItem {
  uri: string;
  name: string;
  type: string;
  isRemote?: boolean;
  url?: string;
  size?: number;
}

export default function CreateRoomScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("");
  const [maintenance, setMaintenance] = useState("");
  const [roomType, setRoomType] = useState<"Single" | "1RK" | "1BHK" | "2BHK" | "Shared" | "PG" | "Other">("Single");
  const [availableFrom, setAvailableFrom] = useState("");
  const [locality, setLocality] = useState(user?.area || "");
  const [description, setDescription] = useState("");
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(["WiFi", "Water 24x7"]);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [coordinatesEdited, setCoordinatesEdited] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [photos, setPhotos] = useState<LocalMediaItem[]>([]);
  const [videos, setVideos] = useState<LocalMediaItem[]>([]);
  const [coverIndex, setCoverIndex] = useState(0);

  const { data: existingRoom, isLoading: isLoadingExisting } = useQuery({
    queryKey: ["listing", id],
    queryFn: () => fetchListingById(id!),
    enabled: isEditing,
  });

  useEffect(() => {
    if (existingRoom) {
      setTitle(existingRoom.title || "");
      setRent(existingRoom.roomDetails?.rent?.toString() || "");
      setDeposit(existingRoom.roomDetails?.deposit?.toString() || "");
      setMaintenance(existingRoom.roomDetails?.maintenance?.toString() || "");
      setRoomType(existingRoom.roomDetails?.roomType || "Single");
      setAvailableFrom(existingRoom.roomDetails?.availableFrom?.slice(0, 10) || "");
      setLocality(existingRoom.locality || "");
      setDescription(existingRoom.description || "");
      if (existingRoom.roomDetails?.amenities) {
        setSelectedAmenities(existingRoom.roomDetails.amenities);
      }
      if (existingRoom.latitude !== undefined && existingRoom.latitude !== null) {
        setLatitude(String(existingRoom.latitude));
      }
      if (existingRoom.longitude !== undefined && existingRoom.longitude !== null) {
        setLongitude(String(existingRoom.longitude));
      }
      if (existingRoom.photos && Array.isArray(existingRoom.photos)) {
        const existingPhotos: LocalMediaItem[] = existingRoom.photos.map((p, idx) => {
          const rawUrl = typeof p === "string" ? p : p.url;
          return {
            uri: getMediaUrl(rawUrl),
            name: typeof p === "object" ? p.name || `photo_${idx}` : `photo_${idx}`,
            type: "image/jpeg",
            isRemote: true,
            url: rawUrl,
          };
        });
        setPhotos(existingPhotos);
      }
      if (existingRoom.videos && Array.isArray(existingRoom.videos)) {
        const existingVideos: LocalMediaItem[] = existingRoom.videos.map((v, idx) => ({
          uri: getMediaUrl(v.url),
          name: v.name || `video_${idx}.mp4`,
          type: "video/mp4",
          isRemote: true,
          url: v.url,
          size: v.size,
        }));
        setVideos(existingVideos);
      }
      if (existingRoom.coverIndex !== undefined) {
        setCoverIndex(existingRoom.coverIndex);
      }
    }
  }, [existingRoom]);

  const mutation = useMutation({
    mutationFn: (payload: any) =>
      isEditing ? updateListing(id!, payload) : createListing(payload),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["listings", "room"] });
      queryClient.invalidateQueries({ queryKey: ["listing", saved.id] });
      Alert.alert(
        "Success",
        isEditing ? "Room listing updated successfully!" : "Room listed successfully!",
        [{ text: "OK", onPress: () => router.back() }]
      );
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || err.message || "Failed to save room listing.";
      setErrorMsg(msg);
    },
  });

  const toggleAmenity = (amenity: string) => {
    if (selectedAmenities.includes(amenity)) {
      setSelectedAmenities(selectedAmenities.filter((a) => a !== amenity));
    } else {
      setSelectedAmenities([...selectedAmenities, amenity]);
    }
  };

  const handleGetGpsLocation = async () => {
    try {
      setIsLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Please grant location access to detect your GPS position.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLatitude(loc.coords.latitude.toFixed(6));
      setLongitude(loc.coords.longitude.toFixed(6));
      setCoordinatesEdited(true);
      Alert.alert(
        "GPS Location Detected",
        `Coordinates: ${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)}`
      );
    } catch (err: any) {
      Alert.alert("Location Error", err.message || "Failed to get current GPS location.");
    } finally {
      setIsLocating(false);
    }
  };

  const handleTakeCameraPhoto = async () => {
    if (photos.length >= 10) {
      Alert.alert("Limit Reached", "You can upload a maximum of 10 photos.");
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission Required", "Camera permission is required to capture room photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets && result.assets[0]) {
      const asset = result.assets[0];
      setPhotos((prev) => [
        ...prev,
        {
          uri: asset.uri,
          name: asset.fileName || `room_photo_${Date.now()}.jpg`,
          type: "image/jpeg",
          isRemote: false,
        },
      ]);
    }
  };

  const handleRecordCameraVideo = async () => {
    if (videos.length >= 2) {
      Alert.alert("Limit Reached", "You can upload a maximum of 2 videos.");
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission Required", "Camera permission is required to record video walkthroughs.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      quality: 0.8,
      videoMaxDuration: 60,
    });
    if (!result.canceled && result.assets && result.assets[0]) {
      const asset = result.assets[0];
      setVideos((prev) => [
        ...prev,
        {
          uri: asset.uri,
          name: asset.fileName || `room_video_${Date.now()}.mp4`,
          type: "video/mp4",
          size: asset.fileSize,
          isRemote: false,
        },
      ]);
    }
  };

  const handlePickGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission Required", "Gallery permission is required to choose photos/videos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets) {
      const newPhotos = [...photos];
      const newVideos = [...videos];

      for (const asset of result.assets) {
        const isVid =
          asset.type === "video" ||
          asset.uri.toLowerCase().endsWith(".mp4") ||
          asset.uri.toLowerCase().endsWith(".mov");

        if (isVid) {
          if (newVideos.length < 2) {
            newVideos.push({
              uri: asset.uri,
              name: asset.fileName || `room_video_${Date.now()}.mp4`,
              type: "video/mp4",
              size: asset.fileSize,
              isRemote: false,
            });
          }
        } else {
          if (newPhotos.length < 10) {
            newPhotos.push({
              uri: asset.uri,
              name: asset.fileName || `room_photo_${Date.now()}.jpg`,
              type: "image/jpeg",
              isRemote: false,
            });
          }
        }
      }

      setPhotos(newPhotos);
      setVideos(newVideos);
    }
  };

  const handleRemovePhoto = (index: number) => {
    const updated = photos.filter((_, idx) => idx !== index);
    setPhotos(updated);
    if (coverIndex >= updated.length) {
      setCoverIndex(Math.max(0, updated.length - 1));
    }
  };

  const handleRemoveVideo = (index: number) => {
    setVideos(videos.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async () => {
    if (!title.trim() || !rent.trim() || !locality.trim()) {
      setErrorMsg("Please fill in the title, rent, and locality.");
      return;
    }
    const rentNum = Number(rent);
    if (isNaN(rentNum) || rentNum <= 0) {
      setErrorMsg("Please enter a valid rental amount.");
      return;
    }
    setErrorMsg("");

    let finalPhotos: any[] = [];
    let finalVideos: any[] = [];

    try {
      setIsUploading(true);

      // 1. Process Photos
      const localPhotosToUpload = photos.filter((p) => !p.isRemote);
      let uploadedPhotoMap: Record<string, string> = {};

      if (localPhotosToUpload.length > 0) {
        const uploaded = await uploadListingMedia(
          localPhotosToUpload.map((p) => ({ uri: p.uri, name: p.name, type: p.type }))
        );
        localPhotosToUpload.forEach((p, idx) => {
          if (uploaded[idx]) {
            uploadedPhotoMap[p.uri] = uploaded[idx].url;
          }
        });
      }

      finalPhotos = photos.map((p) => {
        if (p.isRemote && p.url) return p.url;
        return uploadedPhotoMap[p.uri] || p.uri;
      });

      // 2. Process Videos
      const localVideosToUpload = videos.filter((v) => !v.isRemote);
      let uploadedVideoMap: Record<string, { url: string; size?: number; name?: string }> = {};

      if (localVideosToUpload.length > 0) {
        const uploaded = await uploadListingMedia(
          localVideosToUpload.map((v) => ({ uri: v.uri, name: v.name, type: v.type }))
        );
        localVideosToUpload.forEach((v, idx) => {
          if (uploaded[idx]) {
            uploadedVideoMap[v.uri] = {
              url: uploaded[idx].url,
              name: uploaded[idx].originalName,
              size: uploaded[idx].size,
            };
          }
        });
      }

      finalVideos = videos.map((v) => {
        if (v.isRemote && v.url) {
          return { url: v.url, name: v.name, size: v.size };
        }
        const up = uploadedVideoMap[v.uri];
        return up ? up : { url: v.uri, name: v.name, size: v.size };
      });
    } catch (err: any) {
      setIsUploading(false);
      setErrorMsg(err.response?.data?.error || err.message || "Failed to upload media files.");
      return;
    } finally {
      setIsUploading(false);
    }

    const latNum = latitude.trim() ? Number(latitude) : null;
    const lngNum = longitude.trim() ? Number(longitude) : null;

    const payload: Record<string, any> = {
      type: "room",
      title: title.trim(),
      locality: locality.trim(),
      description: description.trim(),
      photos: finalPhotos,
      videos: finalVideos,
      coverIndex: Math.min(coverIndex, Math.max(0, finalPhotos.length - 1)),
      roomDetails: {
        rent: rentNum,
        deposit: Number(deposit) || 0,
        maintenance: Number(maintenance) || 0,
        roomType,
        availableFrom: availableFrom || null,
        period: "month",
        amenities: selectedAmenities,
        verified: isEditing ? existingRoom?.roomDetails?.verified : false,
      },
    };
    if (!isEditing || coordinatesEdited) {
      payload.latitude = !isNaN(Number(latNum)) ? latNum : null;
      payload.longitude = !isNaN(Number(lngNum)) ? lngNum : null;
    }

    mutation.mutate(payload);
  };

  if (isEditing && isLoadingExisting) {
    return <LoadingView message="Loading listing data..." />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Surface style={styles.card} elevation={1}>
          <Text variant="headlineSmall" style={styles.formTitle}>
            {isEditing ? "Edit Room Listing" : "List a Room"}
          </Text>
          <Text variant="bodySmall" style={styles.formSubtitle}>
            Publish accommodation details with photos, videos, and GPS location
          </Text>

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Text variant="bodySmall" style={styles.errorText}>
                {errorMsg}
              </Text>
            </View>
          ) : null}

          {/* Title */}
          <TextInput
            label="Room Title *"
            value={title}
            onChangeText={(t) => {
              setTitle(t);
              setErrorMsg("");
            }}
            placeholder="e.g. 2 floor house (4 rooms + 2 bathroom)"
            mode="outlined"
            style={styles.input}
          />

          {/* Rent */}
          <TextInput
            label="Monthly Rent (₹) *"
            value={rent}
            onChangeText={(t) => {
              setRent(t);
              setErrorMsg("");
            }}
            keyboardType="numeric"
            placeholder="e.g. 50000"
            mode="outlined"
            style={styles.input}
          />
          <TextInput
            label="Security Deposit (₹)"
            value={deposit}
            onChangeText={setDeposit}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
          />
          <TextInput
            label="Monthly Maintenance (₹)"
            value={maintenance}
            onChangeText={setMaintenance}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
          />
          <View style={styles.previewContainer}>
            <Text variant="titleSmall" style={styles.amenitiesHeading}>Room Type</Text>
            <View style={styles.chipsWrap}>
              {(["Single", "1RK", "1BHK", "2BHK", "Shared", "PG", "Other"] as const).map((type) => (
                <Chip key={type} selected={roomType === type} onPress={() => setRoomType(type)}>{type}</Chip>
              ))}
            </View>
          </View>
          <TextInput
            label="Available from (YYYY-MM-DD)"
            value={availableFrom}
            onChangeText={setAvailableFrom}
            placeholder="2026-11-01"
            mode="outlined"
            style={styles.input}
          />

          {/* Locality */}
          <TextInput
            label="Locality / Area Name *"
            value={locality}
            onChangeText={(t) => {
              setLocality(t);
              setErrorMsg("");
            }}
            placeholder="e.g. Connaught Place, New Delhi"
            mode="outlined"
            style={styles.input}
          />

          {/* Location & GPS Section */}
          <View style={styles.geoSection}>
            <View style={styles.geoHeader}>
              <View style={styles.geoTitleRow}>
                <MapPin size={16} color="#2563EB" />
                <Text variant="titleSmall" style={styles.geoTitle}>
                  Map Coordinates & GPS
                </Text>
              </View>
              <Button
                mode="text"
                compact
                icon={() => <Compass size={16} color="#2563EB" />}
                onPress={handleGetGpsLocation}
                loading={isLocating}
                disabled={isLocating}
                textColor="#2563EB"
              >
                Auto-Detect GPS
              </Button>
            </View>
            <View style={styles.coordRow}>
              <TextInput
                label="Latitude"
                value={latitude}
                onChangeText={(value) => {
                  setLatitude(value);
                  setCoordinatesEdited(true);
                }}
                placeholder="28.6139"
                keyboardType="numeric"
                mode="outlined"
                style={[styles.input, styles.coordInput]}
                dense
              />
              <TextInput
                label="Longitude"
                value={longitude}
                onChangeText={(value) => {
                  setLongitude(value);
                  setCoordinatesEdited(true);
                }}
                placeholder="77.2090"
                keyboardType="numeric"
                mode="outlined"
                style={[styles.input, styles.coordInput]}
                dense
              />
            </View>
          </View>

          {/* Photos & Videos Section */}
          <View style={styles.mediaSection}>
            <Text variant="titleSmall" style={styles.sectionHeading}>
              Room Photos & Videos
            </Text>
            <Text variant="bodySmall" style={styles.mediaHint}>
              Add up to 10 photos and 2 videos (camera or gallery)
            </Text>

            <View style={styles.mediaActionRow}>
              <Button
                mode="outlined"
                compact
                icon={() => <Camera size={14} color="#2563EB" />}
                onPress={handleTakeCameraPhoto}
                style={styles.mediaBtn}
                textColor="#2563EB"
              >
                Photo
              </Button>
              <Button
                mode="outlined"
                compact
                icon={() => <VideoIcon size={14} color="#7C3AED" />}
                onPress={handleRecordCameraVideo}
                style={styles.mediaBtn}
                textColor="#7C3AED"
              >
                Video
              </Button>
              <Button
                mode="outlined"
                compact
                icon={() => <ImageIcon size={14} color="#059669" />}
                onPress={handlePickGallery}
                style={styles.mediaBtn}
                textColor="#059669"
              >
                Gallery
              </Button>
            </View>

            {/* Photos Preview Grid */}
            {photos.length > 0 && (
              <View style={styles.previewContainer}>
                <Text style={styles.previewLabel}>
                  Photos ({photos.length}/10) — Tap star to set cover:
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaScroll}>
                  {photos.map((item, idx) => {
                    const isCover = coverIndex === idx;
                    return (
                      <View key={idx} style={[styles.photoCard, isCover && styles.coverCard]}>
                        <Image source={{ uri: item.uri }} style={styles.photoThumb} />
                        {isCover && (
                          <View style={styles.coverBadge}>
                            <Star size={10} color="#FFFFFF" fill="#FFFFFF" />
                            <Text style={styles.coverText}>COVER</Text>
                          </View>
                        )}
                        <View style={styles.thumbActions}>
                          {!isCover && (
                            <TouchableOpacity
                              onPress={() => setCoverIndex(idx)}
                              style={styles.actionIconBtn}
                            >
                              <Star size={14} color="#2563EB" />
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            onPress={() => handleRemovePhoto(idx)}
                            style={[styles.actionIconBtn, styles.deleteIconBtn]}
                          >
                            <Trash2 size={14} color="#DC2626" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Videos Preview */}
            {videos.length > 0 && (
              <View style={styles.videoPreviewContainer}>
                <Text style={styles.previewLabel}>Videos ({videos.length}/2):</Text>
                {videos.map((vid, idx) => (
                  <View key={idx} style={styles.videoRow}>
                    <VideoIcon size={18} color="#7C3AED" />
                    <Text style={styles.videoName} numberOfLines={1}>
                      {vid.name || `Video ${idx + 1}`}
                    </Text>
                    <TouchableOpacity onPress={() => handleRemoveVideo(idx)}>
                      <Trash2 size={16} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Amenities */}
          <Text variant="titleSmall" style={styles.amenitiesHeading}>
            Select Amenities
          </Text>
          <View style={styles.chipsWrap}>
            {AVAILABLE_AMENITIES.map((amenity) => {
              const isSelected = selectedAmenities.includes(amenity);
              return (
                <Chip
                  key={amenity}
                  selected={isSelected}
                  onPress={() => toggleAmenity(amenity)}
                  style={[styles.chip, isSelected && styles.selectedChip]}
                  textStyle={isSelected ? styles.selectedChipText : styles.chipText}
                >
                  {amenity}
                </Chip>
              );
            })}
          </View>

          {/* Description */}
          <TextInput
            label="Additional Details & Terms"
            value={description}
            onChangeText={setDescription}
            placeholder="Mention rules, mess options, electricity bills, etc."
            multiline
            numberOfLines={4}
            mode="outlined"
            style={[styles.input, styles.textArea]}
          />

          {/* Submit Button */}
          <Button
            mode="contained"
            onPress={handleSubmit}
            loading={mutation.isPending || isUploading}
            disabled={mutation.isPending || isUploading}
            style={styles.submitBtn}
            buttonColor="#2563EB"
          >
            {isUploading
              ? "Uploading Media..."
              : isEditing
              ? "Update Room Listing"
              : "Publish Room"}
          </Button>
        </Surface>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
  },
  formTitle: {
    fontWeight: "800",
    color: "#0F172A",
  },
  formSubtitle: {
    color: "#64748B",
    marginTop: 2,
    marginBottom: 16,
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
  input: {
    marginBottom: 14,
    backgroundColor: "#FFFFFF",
  },
  textArea: {
    height: 100,
  },
  geoSection: {
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  geoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  geoTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  geoTitle: {
    fontWeight: "700",
    color: "#1E293B",
  },
  coordRow: {
    flexDirection: "row",
    gap: 10,
  },
  coordInput: {
    flex: 1,
    marginBottom: 0,
    backgroundColor: "#FFFFFF",
  },
  mediaSection: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#FAFAFA",
  },
  sectionHeading: {
    fontWeight: "700",
    color: "#0F172A",
  },
  mediaHint: {
    color: "#64748B",
    marginTop: 2,
    marginBottom: 10,
  },
  mediaActionRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  mediaBtn: {
    flex: 1,
    borderRadius: 8,
  },
  previewContainer: {
    marginTop: 8,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 8,
  },
  mediaScroll: {
    flexDirection: "row",
  },
  photoCard: {
    position: "relative",
    width: 90,
    height: 90,
    borderRadius: 8,
    marginRight: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  coverCard: {
    borderColor: "#2563EB",
    borderWidth: 2,
  },
  photoThumb: {
    width: "100%",
    height: "100%",
  },
  coverBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2563EB",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    gap: 2,
  },
  coverText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
  },
  thumbActions: {
    position: "absolute",
    bottom: 4,
    right: 4,
    flexDirection: "row",
    gap: 4,
  },
  actionIconBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    padding: 4,
    borderRadius: 4,
  },
  deleteIconBtn: {
    backgroundColor: "rgba(254, 242, 242, 0.95)",
  },
  videoPreviewContainer: {
    marginTop: 10,
  },
  videoRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3E8FF",
    padding: 8,
    borderRadius: 8,
    marginTop: 4,
    gap: 8,
  },
  videoName: {
    flex: 1,
    fontSize: 12,
    color: "#6B21A8",
    fontWeight: "500",
  },
  amenitiesHeading: {
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 6,
    marginBottom: 8,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    backgroundColor: "#F1F5F9",
  },
  selectedChip: {
    backgroundColor: "#DBEAFE",
  },
  chipText: {
    color: "#475569",
    fontSize: 12,
  },
  selectedChipText: {
    color: "#1E40AF",
    fontWeight: "700",
    fontSize: 12,
  },
  submitBtn: {
    borderRadius: 10,
    paddingVertical: 4,
    marginTop: 10,
  },
});
