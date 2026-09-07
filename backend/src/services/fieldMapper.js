export function mapFieldToProfile(field, profile) {
  const { name } = field;

  // Lever card-based custom questions (cards[uuid][fieldN]) are always
  // employer-specific — they can never be auto-filled from the profile.
  if (name && /^cards\[/.test(name)) {
    return { value: null, source: null };
  }

  // ── Label-based matching (Ashby & other ATSes that use label as the key) ──
  // Ashby fields often have no semantic name attr — only a human-readable label.
  // We normalise the label to lowercase and match against common patterns.
  const labelNorm = (field.label || "").toLowerCase().trim();

  if (labelNorm) {
    // Full name / first name / last name
    if (/^(full\s*name|your\s*name)$/.test(labelNorm)) {
      return { value: profile.personalInfo?.fullName, source: "personalInfo.fullName" };
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

    // Email
    if (/^(email|email\s*address|work\s*email)$/.test(labelNorm)) {
      return { value: profile.personalInfo?.email, source: "personalInfo.email" };
    }

    // Phone
    if (/^(phone|phone\s*number|mobile|mobile\s*number|telephone)$/.test(labelNorm)) {
      return { value: profile.personalInfo?.phone, source: "personalInfo.phone" };
    }

    // Location / City
    if (/^(location|city|city.*state|address|where\s*are\s*you\s*based)/.test(labelNorm)) {
      return { value: profile.personalInfo?.address, source: "personalInfo.address" };
    }

    // LinkedIn
    if (/linkedin/.test(labelNorm)) {
      const linkedin = profile.personalInfo?.profiles?.find(
        (p) => p.platform?.toLowerCase() === "linkedin"
      );
      return { value: linkedin?.url ?? null, source: "personalInfo.profiles[LinkedIn]" };
    }

    // GitHub
    if (/github/.test(labelNorm)) {
      const github = profile.personalInfo?.profiles?.find(
        (p) => p.platform?.toLowerCase() === "github"
      );
      return { value: github?.url ?? null, source: "personalInfo.profiles[GitHub]" };
    }

    // Twitter/X
    if (/twitter|x\.com/.test(labelNorm)) {
      const twitter = profile.personalInfo?.profiles?.find(
        (p) => p.platform?.toLowerCase() === "twitter"
      );
      return { value: twitter?.url ?? null, source: "personalInfo.profiles[Twitter]" };
    }

    // Portfolio / Website
    if (/portfolio|personal\s*website|website/.test(labelNorm)) {
      const portfolio = profile.personalInfo?.profiles?.find(
        (p) => ["portfolio", "website"].includes(p.platform?.toLowerCase())
      );
      return { value: portfolio?.url ?? null, source: "personalInfo.profiles[Portfolio]" };
    }

    // Current company / employer
    if (/^(current\s*company|current\s*employer|company|organisation|organization)$/.test(labelNorm)) {
      const currentJob = profile.experience?.find((j) => j.current === true);
      return { value: currentJob?.company ?? null, source: "experience[current].company" };
    }
  }

  // ── URL fields: urls[Platform] ────────────────────────────────────────────
  // Lever uses various casings: urls[GitHub], urls[Github], urls[LinkedIn], etc.
  // Match case-insensitively against the profile's social profiles array.
  if (name && name.startsWith("urls[")) {
    const platform = name.match(/^urls\[(.+)\]$/)?.[1];
    if (platform) {
      const platformKey = platform.toLowerCase();

      // Map common aliases to profile platform names
      const PLATFORM_ALIASES = {
        github:         "github",
        linkedin:       "linkedin",
        twitter:        "twitter",
        "stack overflow": "stackoverflow",
        stackoverflow:  "stackoverflow",
        portfolio:      "portfolio",
        website:        "website",
        "other website": null, // skippable
        "video link":   null, // skippable
        medium:         "medium",
      };

      const targetPlatform = PLATFORM_ALIASES[platformKey];

      // Explicitly skippable — return null so it never surfaces as missing
      if (targetPlatform === null) {
        return { value: null, source: null };
      }

      if (targetPlatform) {
        const profileEntry = profile.personalInfo?.profiles?.find(
          (p) => p.platform?.toLowerCase() === targetPlatform
        );
        return {
          value: profileEntry?.url ?? null,
          source: `personalInfo.profiles[${platform}]`,
        };
      }

      // Unknown platform — look for a fuzzy match in the profile
      const fuzzyMatch = profile.personalInfo?.profiles?.find(
        (p) => p.platform?.toLowerCase().includes(platformKey) ||
               platformKey.includes(p.platform?.toLowerCase())
      );
      if (fuzzyMatch) {
        return { value: fuzzyMatch.url ?? null, source: `personalInfo.profiles[${platform}]` };
      }
    }
    // Unrecognised urls[X] field — no auto-fill (will be skipped below)
    return { value: null, source: null };
  }

  switch (name) {
    case "name":
      return {
        value: profile.personalInfo?.fullName,
        source: "personalInfo.fullName",
      };

    case "email":
      return {
        value: profile.personalInfo?.email,
        source: "personalInfo.email",
      };

    case "phone":
      return {
        value: profile.personalInfo?.phone,
        source: "personalInfo.phone",
      };

    case "location":
      return {
        value: profile.personalInfo?.address,
        source: "personalInfo.address",
      };

    case "org": {
      const currentJob = profile.experience?.find(
        (job) => job.current === true
      );
      return {
        value: currentJob?.company,
        source: "experience[current].company",
      };
    }

    default:
      return {
        value: null,
        source: null,
      };
  }
}

export function createInputQuestion(field) {
  return {
    field: field.name,
    label: getQuestionLabel(field),
    type: field.type,
    ...(field.options?.length > 0 && {
      options: field.options,
    }),
  };
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
  };

  if (knownLabels[field.name]) {
    return knownLabels[field.name];
  }

  // Lever survey fields don't expose their question text cleanly
  if (field.name?.includes("surveysResponses")) {
    return `Survey question (${field.name.split("[").pop()?.replace("]", "")})`;
  }

  // For card fields, prefer the extracted DOM label over the raw name.
  if (field.name && /^cards\[/.test(field.name)) {
    if (label && !/^cards\[/.test(label) && label !== "Additional information") {
      return label;
    }
    const fieldPart = field.name.match(/\[([^\]]+)\]\s*$/);
    return fieldPart ? `Additional question (${fieldPart[1]})` : "Additional question";
  }

  return label;
}

function cleanLabel(label) {
  if (!label) {
    return "Additional information";
  }

  return label
    .replace(/\n/g, " ")
    .replace(/✱/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getMissingFields(fields, profile) {
  const missingFields = [];

  for (const field of fields) {
    const mapping = mapFieldToProfile(field, profile);

    // Profile already provides the answer
    if (mapping.value !== null && mapping.value !== undefined) {
      continue;
    }

    // Skip fields that are optional or not application questions
    if (isSkippableField(field)) {
      continue;
    }

    missingFields.push(createInputQuestion(field));
  }

  return missingFields;
}

function isSkippableField(field) {
  const { name } = field;

  // EEO/diversity fields are optional compliance questions
  if (name?.startsWith("eeo[")) return true;

  // Resume — handled separately
  if (name === "resume") return true;

  // All urls[X] fields that weren't auto-filled are optional social links
  // (if mapFieldToProfile returned null for them, they're unrecognised platforms)
  if (name?.startsWith("urls[")) return true;

  return false;
}