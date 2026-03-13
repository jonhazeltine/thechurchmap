import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Share2, Link2, Check } from "lucide-react";
import { SiX, SiFacebook, SiLinkedin, SiInstagram, SiTiktok, SiWhatsapp, SiTelegram } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { usePlatformContext } from "@/contexts/PlatformContext";

interface ShareMenuProps {
  postId: string;
  title?: string;
}

export function ShareMenu({ postId, title }: ShareMenuProps) {
  const { toast } = useToast();
  const { platform } = usePlatformContext();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const getShareUrl = () => {
    const baseUrl = window.location.origin;
    const platformSlug = platform?.slug;
    if (platformSlug) {
      return `${baseUrl}/${platformSlug}/community/${postId}`;
    }
    return `${baseUrl}/community/${postId}`;
  };

  const getShareText = () => {
    return title || "Check out this post from The Church Map community!";
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(getShareUrl());
      setCopied(true);
      toast({
        title: "Link copied",
        description: "Post link has been copied to clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Could not copy link to clipboard.",
        variant: "destructive",
      });
    }
  };

  const handleShareFacebook = () => {
    const url = getShareUrl();
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer"
    );
    setOpen(false);
  };

  const handleShareTwitter = () => {
    const url = getShareUrl();
    const text = getShareText();
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer"
    );
    setOpen(false);
  };

  const handleShareLinkedIn = () => {
    const url = getShareUrl();
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer"
    );
    setOpen(false);
  };

  const handleShareWhatsApp = () => {
    const url = getShareUrl();
    const text = getShareText();
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
      "_blank",
      "noopener,noreferrer"
    );
    setOpen(false);
  };

  const handleShareTelegram = () => {
    const url = getShareUrl();
    const text = getShareText();
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer"
    );
    setOpen(false);
  };

  const handleNativeShare = async (appName: string) => {
    const url = getShareUrl();
    const text = getShareText();

    if (navigator.share) {
      try {
        await navigator.share({
          title: text,
          text: `${text}\n`,
          url: url,
        });
        setOpen(false);
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          setOpen(false);
          return;
        }
      }
    }

    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast({
        title: "Link copied",
        description: `Paste this link in ${appName} to share.`,
      });
    } catch {
      toast({
        title: "Share link",
        description: url,
      });
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 px-2 h-8"
          data-testid={`button-share-${postId}`}
        >
          <Share2 className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">Share</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="end">
        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="justify-start gap-2 h-9"
            onClick={handleCopyLink}
            data-testid={`button-copy-link-${postId}`}
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            {copied ? "Copied!" : "Copy link"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start gap-2 h-9"
            onClick={handleShareWhatsApp}
            data-testid={`button-share-whatsapp-${postId}`}
          >
            <SiWhatsapp className="h-4 w-4" />
            WhatsApp
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start gap-2 h-9"
            onClick={handleShareTelegram}
            data-testid={`button-share-telegram-${postId}`}
          >
            <SiTelegram className="h-4 w-4" />
            Telegram
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start gap-2 h-9"
            onClick={handleShareFacebook}
            data-testid={`button-share-facebook-${postId}`}
          >
            <SiFacebook className="h-4 w-4" />
            Facebook
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start gap-2 h-9"
            onClick={handleShareTwitter}
            data-testid={`button-share-twitter-${postId}`}
          >
            <SiX className="h-4 w-4" />
            X
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start gap-2 h-9"
            onClick={handleShareLinkedIn}
            data-testid={`button-share-linkedin-${postId}`}
          >
            <SiLinkedin className="h-4 w-4" />
            LinkedIn
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start gap-2 h-9"
            onClick={() => handleNativeShare("Instagram")}
            data-testid={`button-share-instagram-${postId}`}
          >
            <SiInstagram className="h-4 w-4" />
            Instagram
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start gap-2 h-9"
            onClick={() => handleNativeShare("TikTok")}
            data-testid={`button-share-tiktok-${postId}`}
          >
            <SiTiktok className="h-4 w-4" />
            TikTok
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
