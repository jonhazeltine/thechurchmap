import { MapPin, Globe, Mail, Phone } from "lucide-react";

interface ChurchContactInfoProps {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  layout?: "compact" | "full";
  showWebsite?: boolean;
}

function isCorruptedAddressField(value: string | null | undefined): boolean {
  if (!value) return false;
  const streetPatterns = /\b(Road|Street|Avenue|Drive|Boulevard|Lane|Way|Court|Circle|Place|Terrace|Highway|Hwy|Rd|St|Ave|Dr|Blvd|Ln|Ct|Pl|Ter)\b/i;
  const startsWithNumber = /^\d+\s+\w+/;
  return streetPatterns.test(value) || startsWithNumber.test(value);
}

export function ChurchContactInfo({
  address,
  city,
  state,
  zip,
  email,
  phone,
  website,
  layout = "full",
  showWebsite = true,
}: ChurchContactInfoProps) {
  const containerClass = layout === "compact" ? "space-y-2" : "space-y-3";
  const textSize = layout === "compact" ? "text-xs" : "text-sm";
  
  const cleanCity = isCorruptedAddressField(city) ? null : city;
  const cleanState = isCorruptedAddressField(state) ? null : state;

  return (
    <div className={containerClass}>
      {(address || cleanCity || cleanState) && (
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
          <div className={textSize}>
            {address && <div>{address}</div>}
            {(cleanCity || cleanState) && (
              <div className="text-muted-foreground">
                {[cleanCity, cleanState].filter(Boolean).join(", ")}
                {zip && ` ${zip}`}
              </div>
            )}
          </div>
        </div>
      )}

      {email && (
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <a
            href={`mailto:${email}`}
            className={`${textSize} text-primary hover:underline`}
            data-testid="link-email"
          >
            {email}
          </a>
        </div>
      )}

      {phone && (
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <a
            href={`tel:${phone}`}
            className={`${textSize} text-primary hover:underline`}
            data-testid="link-phone"
          >
            {phone}
          </a>
        </div>
      )}

      {showWebsite && website && (
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <a
            href={website}
            target="_blank"
            rel="noopener noreferrer"
            className={`${textSize} text-primary hover:underline`}
            data-testid="link-website"
          >
            {website}
          </a>
        </div>
      )}
    </div>
  );
}
