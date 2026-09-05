export function mapFieldToProfile(field, profile) {
  const { name } = field;

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

    case "urls[LinkedIn]": {
      const linkedin = profile.personalInfo?.profiles?.find(
        (profile) => profile.platform?.toLowerCase() === "linkedin"
      );

      return {
        value: linkedin?.url,
        source: "personalInfo.profiles[LinkedIn]",
      };
    }

    case "urls[Github]": {
      const github = profile.personalInfo?.profiles?.find(
        (profile) => profile.platform?.toLowerCase() === "github"
      );

      return {
        value: github?.url,
        source: "personalInfo.profiles[Github]",
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
  // through the current DOM extractor. Keep the field identifiable
  // instead of pretending an option is the question.
  if (field.name?.includes("surveysResponses")) {
    return `Survey question (${field.name.split("[").pop()?.replace("]", "")})`;
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

    // Skip fields that are genuinely optional and not
    // application questions.
    if (isSkippableField(field)) {
      continue;
    }

    missingFields.push(createInputQuestion(field));
  }

  return missingFields;
}

function isSkippableField(field) {
  const skippableFields = [
    "resume",
    "urls[Other Website]",
    "urls[Video Link ]",
  ];

  return skippableFields.includes(field.name);
}