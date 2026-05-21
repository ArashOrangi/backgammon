import { FormatRegistry, type Static, TObject } from "@sinclair/typebox";
import {
  TypeCompiler,
  ValueError,
  ValueErrorType,
} from "@sinclair/typebox/compiler";
import { textFixer } from "@/components/textFixer";
import {
  otpLength,
  phoneNumberLength,
  userPasswordLength,
} from "@/static/statics";

const socialWords = [
  "ایتا",
  "روبیکا",
  "بله",
  "سروش",
  "تلگرام",
  "اینستاگرام",
  "شاد",
  "واتساپ",
];
const linkWords = [
  "https",
  "www[.]",
  "[.]ir",
  "[.]com",
  "[.]org",
  "[.]me",
  "[.]net",
];
const bestWords = ["بهترین", "برترین"];

export const formats = {
  email:
    /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,
  number: /^[0-9]+$/,
  persian: /^[\u0600-\u06FF0123456789\s]+$/,
  noSpecial: /^[\u0600-\u06FF0123456789abcdefghijklmnopqrstuvwxyz\s]+$/i,
  english: /^[\w-_]+$/,
  noEnglish: /a|b|c|d|e|f|g|h|i|j|k|l|m|n|o|p|q|r|s|t|u|v|w|x|y|z/i,
  mobileInText:
    /(9|989)\W?(14|13|12|19|18|17|15|16|11|10|90|91|92|93|94|95|96|32|30|33|35|36|37|38|39|00|01|02|03|04|05|41|20|21|22|23|31|34|9910|9911|9913|9914|9999|999|990|9810|9811|9812|9813|9814|9815|9816|9817|998)\W?\d{1}\W?\d{1}\W?\d{1}\W?\d{1}\W?\d{1}\W?\d{1}\W?\d{1}/,
  phoneInText:
    /(0|98)\W?(41|44|45|31|84|77|21|38|51|56|58|61|24|23|54|71|26|25|28|87|34|83|74|17|13|66|11|86|76|81|35)\W?\d{1}\W?\d{1}\W?\d{1}\W?\d{1}\W?\d{1}\W?\d{1}\W?\d{1}\W?\d{1}/,
};

export function validator<T extends Record<string, any>, S extends TObject>({
  data,
  schema,
  options,
}: {
  data: T;
  schema: S;
  options?: { preventFixProps: string[] };
}):
  | { isValid: false; errors: { [key: string]: string[] } }
  | { isValid: true; data: Static<typeof schema> } {
  FormatRegistry.Set("email", (item) => formats.email.test(item));
  FormatRegistry.Set("persian", (item) => formats.persian.test(item));
  FormatRegistry.Set("english", (item) => formats.english.test(item));
  FormatRegistry.Set("noEnglish", (item) => !formats.noEnglish.test(item));
  FormatRegistry.Set("number", (item) => formats.number.test(item));
  FormatRegistry.Set(
    "noPhone",
    (item) =>
      !formats.mobileInText.test(item) && !formats.phoneInText.test(item),
  );
  FormatRegistry.Set(
    "otp",
    (item) => formats.number.test(item) && item.length === otpLength,
  );
  FormatRegistry.Set("shortAddress", (item) => item.length < 25);
  FormatRegistry.Set("address", (item) => item.length >= 15);
  FormatRegistry.Set("noSpecial", (item) => formats.noSpecial.test(item));

  FormatRegistry.Set("telephone", (item) => {
    const isPhone = formats.phoneInText.test(item);
    const isMobile = formats.mobileInText.test(item);
    return item.length === phoneNumberLength && (isPhone || isMobile);
  });

  FormatRegistry.Set("mobile", (item) => {
    const isMobile = formats.mobileInText.test(item);
    return item.length === phoneNumberLength && isMobile;
  });

  FormatRegistry.Set("noSocial", (item) => {
    for (const text of socialWords) {
      const regex = new RegExp(`(^|\\s|\\p{P})(${text})(\\s|\\p{P}|$)`, "gu");
      const has = regex.test(item);
      if (has) return false;
    }
    for (const text of linkWords) {
      const regex = new RegExp(`^(${linkWords.join(")|(")})$`);
      const has = regex.test(item);
      if (has) return false;
    }
    return true;
  });

  FormatRegistry.Set("noBest", (item) => {
    for (const text of bestWords) {
      const regex = new RegExp(`(^|\\s|\\p{P})(${text})(\\s|\\p{P}|$)`, "gu");
      const has = regex.test(item);
      if (has) return false;
    }
    return true;
  });

  fixerLoop: for (const key in data) {
    if (typeof data[key] === "string") {
      if (options?.preventFixProps) {
        for (const prop of options.preventFixProps) {
          if (key === prop) continue fixerLoop;
        }
      }

      let text = textFixer(data[key]);

      if (schema.properties[key]) {
        const prop = schema.properties[key];
        const formats: string[] = [];
        if (prop.format) formats.push(prop.format);
        if (prop.allOf)
          prop.allOf.map((item: any) => formats.push(item.format ?? ""));
        if (formats.includes("telephone") || formats.includes("mobile"))
          text = text.match(/\d+/g)?.join("") ?? text;
      }

      (data as any)[key] = text;
    }
  }

  // TODO const validations: { [key: string]: string[]; } = {};
  const validations: { [key: string]: string[] } = {};
  const compiled = TypeCompiler.Compile(schema);
  const errors = [...compiled.Errors(data)];

  if (errors.length) {
    errors.forEach((e) => {
      console.log({ e });

      const message = errMessage(e);
      if (!message) return;

      if (!validations[e.path.substring(1)])
        validations[e.path.substring(1)] = [message];
      else {
        const exist = validations[e.path.substring(1)].find(
          (i) => i === message,
        );
        if (!exist) validations[e.path.substring(1)].push(message);
      }
      // validations[e.path.substring(1)] = errMessage(e);
    });

    return { errors: validations, isValid: false };
  }

  return { data: data as Static<typeof schema>, isValid: true };
}

function errMessage(error: ValueError): string | null {
  //TODO console.log(error.schema);
  if (error.type === ValueErrorType.ObjectRequiredProperty) return null;
  if (error.schema.error) return error.schema.error;

  switch (error.type) {
    case ValueErrorType.Object:
      if (error.schema.error) return error.schema.error;
      return "بسته مقادیر ناشناس";

    case ValueErrorType.Number:
    case ValueErrorType.Integer:
      return "لطفاً مقدار را به صورت عددی وارد نمایید";

    case ValueErrorType.NumberMaximum:
    case ValueErrorType.IntegerMaximum:
      return `حداکثر مقدار قابل قبول ${error.schema.maximum} است.`;

    case ValueErrorType.NumberMinimum:
    case ValueErrorType.IntegerMinimum:
      return `حداقل مقدار قابل قبول ${error.schema.minimum} است.`;

    case ValueErrorType.String:
      return "اطلاعات این فیلد را تکمیل نمایید";
    case ValueErrorType.StringMaxLength:
      return `در این فیلد باید کمتر از ${error.schema.maxLength} کاراکتر وارد نمایید`;
    case ValueErrorType.StringMinLength:
      return "اطلاعات وارد شده کوتاه است. لطفاً با توجه به راهنما اطلاعات این فیلد را وارد نمایید";
    case ValueErrorType.StringFormat:
      switch (error.schema.format) {
        case "persian":
          return "لطفاً اطلاعات این فیلد را فقط با استفاده از حروف فارسی و با توجه به راهنما وارد نمایید";
        case "english":
          return "فقط می‌توانید از حروف انگلیسی، اعداد و در بین کاراکترها از ( _ و - ) استفاده نمایید.";
        case "number":
          return "لطفاً تنها از اعداد استفاده نمایید";
        case "email":
          return "لطفاً ایمیل را به صورت صحیح وارد نمایید";
        case "mobile":
          return "لطفاً شماره موبایل را به صورت صحیح وارد نمایید";
        case "telephone":
          return "لطفاً شماره تلفن را به صورت صحیح وارد نمایید";
        case "otp":
          return "فرمت کد وارد شده صحیح نیست";
        case "password":
          return " رمز باید حد اقل از ۸ کاراکتر تشکیل شود ,فرمت رمز وارد شده صحیح نیست";
        case "date":
          return "تاریخ را به صورت صحیح وارد نمایید";
        case "noEnglish":
          return "لطفاً اطلاعات این فیلد را با استفاده از حروف فارسی و با توجه به راهنما وارد نمایید";
        case "noPhone":
          return "نوشتن شماره تلفن در این فیلد غیر مجاز است. لطفاً با توجه به راهنما اطلاعات این فیلد را وارد نمایید";
        case "shortAddress":
          return "فقط یکی از موارد را بنویسید. نام میدان یا خیابان یا محله";
        case "address":
          return "لطفاً آدرس را به صورت دقیق و با توجه به راهنما وارد نمایید";
        case "noSocial":
          return "هدایت کاربران به پلتفرم‌های دیگر و درج هر نوع لینک در این فیلد غیر مجاز است";
        case "noSpecial":
          return "فقط از حروف فارسی، انگلیسی و اعداد استفاده نمایید. استفاده از هر نوع کاراکتر دیگر در این فیلد غیر مجاز است";
        default:
          return "لطفاً با الگوی صحیح ارسال نمایید";
      }

    case ValueErrorType.Boolean:
      return "لطفاً یک گزینه را انتخاب نمایید";
    case ValueErrorType.Array:
      return "لطفاً لیست مقادیر را وارد نمایید";
    case ValueErrorType.Union:
      return "لطفاً از میان گزینه ها انتخاب نمایید ";

    case ValueErrorType.Intersect:
      return null;

    default:
      //TODO  console.log(error) => to logger;
      return `خطای ناشناس : ${error.message} ${error.type} ${error.value}`;
  }
}

// فقط می‌توانید از حروف انگلیسی، اعداد و در بین کاراکترها از ( _ و - ) استفاده کنید.
