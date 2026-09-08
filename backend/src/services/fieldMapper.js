export function mapFieldToProfile(field, profile) {
  const isChoiceField =
    field.type === "radio" || field.type === "select" || field.type === "checkbox";

  const labelNorm = (field.label || "").toLowerCase().trim();
  const nameNorm = (field.name || "").toLowerCase().trim();

  // ── Choice fields: never dump free-text profile values into radios/checkboxes ──
  if (isChoiceField) {
    // SMS / text consent → default "Yes" / given when possible
    if (/sms|text message|consent|communication/.test(labelNorm) || /consent/i.test(nameNorm)) {
      const opts = field.options || [];
      const yesOption = opts.find(
        (o) =>
          /^(yes|given)/i.test(String(o.value ?? "")) ||
          /^(yes|given)/i.test(String(o.label ?? "")) ||
          /consent/i.test(String(o.label ?? "")) && !/\bno\b|do not/i.test(String(o.label ?? ""))
      );
      if (yesOption) {
        return {
          value: yesOption.value ?? yesOption.label,
          source: "default_sms_consent",
        };
      }
      // Prefer value "given" used by Ashby
      if (opts.some((o) => String(o.value).toLowerCase() === "given")) {
        return { value: "given", source: "default_sms_consent" };
      }
    }

    // Privacy / terms single checkbox → auto-agree
    if (
      field.type === "checkbox" &&
      (/privacy|terms|agree|policy|gdpr/i.test(labelNorm) ||
        /privacy|terms|policy/i.test(nameNorm))
    ) {
      const opts = field.options || [];
      if (opts.length <= 1) {
        return { value: true, source: "default_privacy_consent" };
      }
      const agree = opts.find((o) =>
        /agree|yes|accept|true|on/i.test(`${o.value} ${o.label}`)
      );
      if (agree) {
        return { value: agree.value ?? true, source: "default_privacy_consent" };
      }
      return { value: true, source: "default_privacy_consent" };
    }

    // Don't map phone/email/name strings onto choice widgets
    if (/phone|mobile|tel|email|full name|first name|last name/i.test(labelNorm)) {
      return { value: null, source: null };
    }
  }

  // Lever card questions — never auto-fill
  if (field.name && /^cards\[/.test(field.name)) {
    return { value: null, source: null };
  }

  // ── Ashby system field names ──────────────────────────────────────────────
  if (nameNorm === "_systemfield_name" || nameNorm === "name") {
    return {
      value: profile.personalInfo?.fullName ?? null,
      source: "personalInfo.fullName",
    };
  }
  if (nameNorm === "_systemfield_email" || nameNorm === "email") {
    return {
      value: profile.personalInfo?.email ?? null,
      source: "personalInfo.email",
    };
  }
  if (nameNorm === "_systemfield_phone" || nameNorm === "phone") {
    return {
      value: profile.personalInfo?.phone ?? null,
      source: "personalInfo.phone",
    };
  }
  if (nameNorm === "_systemfield_location" || nameNorm === "location") {
    return {
      value: profile.personalInfo?.address ?? null,
      source: "personalInfo.address",
    };
  }

  // ── Label-based matching ──────────────────────────────────────────────────
  if (labelNorm) {
    if (/^(full\s*name|your\s*name|name)$/.test(labelNorm)) {
      return {
        value: profile.personalInfo?.fullName ?? null,
        source: "personalInfo.fullName",
      };
    }
    if (/^first\s*name$/.test(labelNorm)) {
      const firstName = profile.personalInfo?.fullName?.split(" ")[0];
      return { value: firstName ?? null, source: "personalInfo.fullName (first)" };
    }
    if (/^last\s*name$/.test(labelNorm)) {
      const parts = profile.personalInfo?.fullName?.split(" ") ?? [];
      const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
      return { value: lastName, source: "personalInfo.fullName (last)" };
    }
    if (/^(email|email\s*address|work\s*email)$/.test(labelNorm)) {
      return {
        value: profile.personalInfo?.email ?? null,
        source: "personalInfo.email",
      };
    }
    if (/^(phone|phone\s*number|mobile|mobile\s*number|telephone)$/.test(labelNorm)) {
      return {
        value: profile.personalInfo?.phone ?? null,
        source: "personalInfo.phone",
      };
    }
    if (/^(location|city|city.*state|address|where\s*are\s*you\s*based)/.test(labelNorm)) {
      return {
        value: profile.personalInfo?.address ?? null,
        source: "personalInfo.address",
      };
    }
    if (/linkedin/.test(labelNorm)) {
      const linkedin = profile.personalInfo?.profiles?.find(
        (p) => p.platform?.toLowerCase() === "linkedin"
      );
      return {
        value: linkedin?.url ?? null,
        source: "personalInfo.profiles[LinkedIn]",
      };
    }
    if (/github/.test(labelNorm)) {
      const github = profile.personalInfo?.profiles?.find(
        (p) => p.platform?.toLowerCase() === "github"
      );
      return {
        value: github?.url ?? null,
        source: "personalInfo.profiles[GitHub]",
      };
    }
    if (/twitter|x\.com/.test(labelNorm)) {
      const twitter = profile.personalInfo?.profiles?.find(
        (p) => p.platform?.toLowerCase() === "twitter"
      );
      return {
        value: twitter?.url ?? null,
        source: "personalInfo.profiles[Twitter]",
      };
    }
    if (/portfolio|personal\s*website|website/.test(labelNorm)) {
      const portfolio = profile.personalInfo?.profiles?.find((p) =>
        ["portfolio", "website"].includes(p.platform?.toLowerCase())
      );
      return {
        value: portfolio?.url ?? null,
        source: "personalInfo.profiles[Portfolio]",
      };
    }
    if (
      /^(current\s*company|current\s*employer|company|organisation|organization)$/.test(
        labelNorm
      )
    ) {
      const currentJob = profile.experience?.find((j) => j.current === true);
      return {
        value: currentJob?.company ?? null,
        source: "experience[current].company",
      };
    }
  }

  // ── URL fields: urls[Platform] ────────────────────────────────────────────
  const name = field.name;
  if (name && name.startsWith("urls[")) {
    const platform = name.match(/^urls\[(.+)\]$/)?.[1];
    if (platform) {
      const platformKey = platform.toLowerCase();
      const PLATFORM_ALIASES = {
        github: "github",
        linkedin: "linkedin",
        twitter: "twitter",
        "stack overflow": "stackoverflow",
        stackoverflow: "stackoverflow",
        portfolio: "portfolio",
        website: "website",
        "other website": null,
        "video link": null,
        medium: "medium",
      };
      const targetPlatform = PLATFORM_ALIASES[platformKey];
      if (targetPlatform === null) return { value: null, source: null };
      if (targetPlatform) {
        const profileEntry = profile.personalInfo?.profiles?.find(
          (p) => p.platform?.toLowerCase() === targetPlatform
        );
        return {
          value: profileEntry?.url ?? null,
          source: `personalInfo.profiles[${platform}]`,
        };
      }
      const fuzzyMatch = profile.personalInfo?.profiles?.find(
        (p) =>
          p.platform?.toLowerCase().includes(platformKey) ||
          platformKey.includes(p.platform?.toLowerCase())
      );
      if (fuzzyMatch) {
        return {
          value: fuzzyMatch.url ?? null,
          source: `personalInfo.profiles[${platform}]`,
        };
      }
    }
    return { value: null, source: null };
  }

  switch (name) {
    case "name":
      return {
        value: profile.personalInfo?.fullName ?? null,
        source: "personalInfo.fullName",
      };
    case "email":
      return {
        value: profile.personalInfo?.email ?? null,
        source: "personalInfo.email",
      };
    case "phone":
      return {
        value: profile.personalInfo?.phone ?? null,
        source: "personalInfo.phone",
      };
    case "location":
      return {
        value: profile.personalInfo?.address ?? null,
        source: "personalInfo.address",
      };
    case "org": {
      const currentJob = profile.experience?.find((job) => job.current === true);
      return {
        value: currentJob?.company ?? null,
        source: "experience[current].company",
      };
    }
    default:
      return { value: null, source: null };
  }
}

function cleanLabel(label) {
  if (!label) return "Additional information";
  return label
    .replace(/\n/g, " ")
    .replace(/✱/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getQuestionLabel(field) {
  const label = cleanLabel(field.label);

  const knownLabels = {
    pronouns: "Pronouns",
    "eeo[gender]": "Gender",
    "eeo[race]": "Race",
    "eeo[veteran]": "Veteran status",
    "eeo[disability]": "Disability status",
    "eeo[disabilitySignature]": "Name",
    "eeo[disabilitySignatureDate]": "Date",
    communicationConsent: "Do you consent to receiving text messages?",
    recruiting_privacy_policy: "Recruiting Privacy Policy",
    _systemfield_name: "Full Name",
    _systemfield_email: "Email",
  };

  if (knownLabels[field.name]) return knownLabels[field.name];

  if (field.name?.includes("surveysResponses")) {
    return `Survey question (${field.name.split("[").pop()?.replace("]", "")})`;
  }

  if (field.name && /^cards\[/.test(field.name)) {
    if (label && !/^cards\[/.test(label) && label !== "Additional information") {
      return label;
    }
    const fieldPart = field.name.match(/\[([^\]]+)\]\s*$/);
    return fieldPart ? `Additional question (${fieldPart[1]})` : "Additional question";
  }

  return label;
}

/**
 * ALWAYS returns a valid question object (Mongoose + frontend require field/label/type).
 */
export function createInputQuestion(field) {
  const name = field.name || field.id || `unknown_${Math.random().toString(36).slice(2, 8)}`;
  const label = getQuestionLabel(field);
  const type = field.type || "text";

  // Single checkbox (I agree / privacy)
  if (type === "checkbox" && (!field.options || field.options.length <= 1)) {
    return {
      field: name,
      label,
      type: "checkbox",
      required: !!field.required,
      options: [
        { value: "true", label: "I agree" },
        { value: "false", label: "I do not agree" },
      ],
    };
  }

  // Multi checkbox / radio / select — pass options through
  if (type === "checkbox" || type === "radio" || type === "select") {
    return {
      field: name,
      label,
      type,
      required: !!field.required,
      options: (field.options || []).map((o) => ({
        value: o.value ?? o.label ?? "",
        label: o.label ?? String(o.value ?? ""),
      })),
    };
  }

  // Privacy policy mis-detected as text → treat as agree checkbox
  if (
    type === "text" &&
    /privacy|policy|terms|agree/i.test(`${name} ${label}`)
  ) {
    return {
      field: name,
      label,
      type: "checkbox",
      required: !!field.required,
      options: [
        { value: "true", label: "I agree" },
        { value: "false", label: "I do not agree" },
      ],
    };
  }

  // Default: free text / textarea / email / tel / etc.
  return {
    field: name,
    label,
    type: type === "input" ? "text" : type,
    required: !!field.required,
    options: [],
  };
}

export function getMissingFields(fields, profile) {
  const missingFields = [];

  for (const field of fields) {
    const mapping = mapFieldToProfile(field, profile);

    if (mapping.value !== null && mapping.value !== undefined) {
      continue;
    }

    if (isSkippableField(field)) {
      continue;
    }

    const question = createInputQuestion(field);

    // Defensive: never push incomplete questions (blank UI + Mongoose errors)
    if (!question?.field || !question?.label || !question?.type) {
      console.warn("[fieldMapper] Skipping invalid question for field:", field);
      continue;
    }

    missingFields.push(question);
  }

  return missingFields;
}

function isSkippableField(field) {
  const blob = `${field.name || ""} ${field.id || ""} ${field.label || ""}`.toLowerCase();
  if (/recaptcha|captcha|honeypot|g-recaptcha/.test(blob)) return true;
  if (field.type === "file") return true;
  // Optional empty URL-ish fields often safe to skip when not required
  if (
    !field.required &&
    field.type === "text" &&
    /other website|video link/i.test(blob)
  ) {
    return true;
  }
  return false;
}