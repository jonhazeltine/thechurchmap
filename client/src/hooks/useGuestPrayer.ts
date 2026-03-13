import { useState, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";

interface PrayerPayload {
  prayer_id?: string;
  church_id?: string;
}

interface UseGuestPrayerReturn {
  isGuest: boolean;
  showGuestModal: boolean;
  pendingPrayer: PrayerPayload | null;
  pendingPrayerTitle: string | null;
  pendingChurchName: string | null;
  openGuestModal: (payload: PrayerPayload, title?: string, churchName?: string) => void;
  closeGuestModal: () => void;
  submitGuestPrayer: (guestName: string) => Promise<void>;
  submitPrayer: (payload: PrayerPayload, options?: { title?: string; churchName?: string }) => Promise<{ success: boolean; needsGuestName: boolean }>;
}

export function useGuestPrayer(): UseGuestPrayerReturn {
  const { user } = useAuth();
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [pendingPrayer, setPendingPrayer] = useState<PrayerPayload | null>(null);
  const [pendingPrayerTitle, setPendingPrayerTitle] = useState<string | null>(null);
  const [pendingChurchName, setPendingChurchName] = useState<string | null>(null);

  const isGuest = !user;

  const openGuestModal = useCallback((payload: PrayerPayload, title?: string, churchName?: string) => {
    setPendingPrayer(payload);
    setPendingPrayerTitle(title || null);
    setPendingChurchName(churchName || null);
    setShowGuestModal(true);
  }, []);

  const closeGuestModal = useCallback(() => {
    setShowGuestModal(false);
    setPendingPrayer(null);
    setPendingPrayerTitle(null);
    setPendingChurchName(null);
  }, []);

  const submitGuestPrayer = useCallback(async (guestName: string) => {
    if (!pendingPrayer) {
      throw new Error("No pending prayer to submit");
    }

    await apiRequest("POST", "/api/prayers/pray", {
      ...pendingPrayer,
      guest_name: guestName,
    });
  }, [pendingPrayer]);

  const submitPrayer = useCallback(async (
    payload: PrayerPayload, 
    options?: { title?: string; churchName?: string }
  ): Promise<{ success: boolean; needsGuestName: boolean }> => {
    try {
      await apiRequest("POST", "/api/prayers/pray", payload);
      return { success: true, needsGuestName: false };
    } catch (error: any) {
      const errorMessage = error.message || "";
      
      if (errorMessage.includes("400") || errorMessage.includes("Guest name required")) {
        openGuestModal(payload, options?.title, options?.churchName);
        return { success: false, needsGuestName: true };
      }

      throw error;
    }
  }, [openGuestModal]);

  return {
    isGuest,
    showGuestModal,
    pendingPrayer,
    pendingPrayerTitle,
    pendingChurchName,
    openGuestModal,
    closeGuestModal,
    submitGuestPrayer,
    submitPrayer,
  };
}
