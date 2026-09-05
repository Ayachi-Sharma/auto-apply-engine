import { mapFieldToProfile, createInputQuestion,   getMissingFields,
} from "./fieldMapper.js";

const profile = {
  personalInfo: {
    fullName: "Ayachi Sharma",
    email: "ayachi@example.com",
    phone: "+91-9876543210",
    address: "Jaipur, Rajasthan",
    profiles: [
      {
        platform: "LinkedIn",
        url: "https://linkedin.com/in/ayachi",
      },
      {
        platform: "Github",
        url: "https://github.com/ayachi",
      },
    ],
  },

  experience: [
    {
      company: "Tech Company",
      title: "Software Developer",
      current: true,
    },
  ],
};

const fields = [
  {
    name: "name",
    label: "Full name",
    type: "text",
  },
  {
    name: "email",
    label: "Email",
    type: "email",
  },
  {
    name: "phone",
    label: "Phone",
    type: "text",
  },
  {
    name: "location",
    label: "Current location",
    type: "text",
  },
  {
    name: "org",
    label: "Current company",
    type: "text",
  },
  {
    name: "urls[LinkedIn]",
    label: "LinkedIn URL",
    type: "text",
  },
  {
    name: "urls[Github]",
    label: "Github URL",
    type: "text",
  },
];

console.log("\n========== FIELD MAPPING ==========\n");

for (const field of fields) {
  const result = mapFieldToProfile(field, profile);

  console.log(field.name, "→", result);
}

console.log("\n========== MISSING FIELD QUESTION ==========\n");

const unknownField = {
  name: "eeo[gender]",
  label: "Gender\nSelect ...\nMale\nFemale\nDecline to self-identify",
  type: "select",
  required: false,
  options: [
    {
      value: "",
      label: "Select ...",
    },
    {
      value: "Male",
      label: "Male",
    },
    {
      value: "Female",
      label: "Female",
    },
    {
      value: "Decline to self-identify",
      label: "Decline to self-identify",
    },
  ],
};

console.log(createInputQuestion(unknownField));


console.log("\n========== MISSING FIELDS ==========\n");

const allLeverFields = [
  {
    name: "name",
    label: "Full name",
    type: "text",
    required: true,
  },
  {
    name: "email",
    label: "Email",
    type: "email",
    required: true,
  },
  {
    name: "phone",
    label: "Phone",
    type: "text",
    required: true,
  },
  {
    name: "workAuthorization",
    label: "Are you legally authorized to work?",
    type: "select",
    required: true,
    options: [
      {
        value: "yes",
        label: "Yes",
      },
      {
        value: "no",
        label: "No",
      },
    ],
  },
  {
    name: "eeo[gender]",
    label: "Gender",
    type: "select",
    required: false,
    options: [
      { value: "", label: "Select ..." },
      { value: "Male", label: "Male" },
      { value: "Female", label: "Female" },
      {
        value: "Decline to self-identify",
        label: "Decline to self-identify",
      },
    ],
  },
  {
    name: "eeo[race]",
    label: "Race",
    type: "radio",
    required: false,
    options: [
      {
        value: "Asian (Not Hispanic or Latino)",
        label: "Asian (Not Hispanic or Latino)",
      },
      {
        value: "Decline to self-identify",
        label: "Decline to self-identify",
      },
    ],
  },
];

const missingFields = getMissingFields(allLeverFields, profile);

console.log(JSON.stringify(missingFields, null, 2));