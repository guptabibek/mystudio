import { NextResponse, NextRequest } from "next/server";
import { z } from "zod";
import { emailService } from "@/lib/services/email";
import { config } from "@/lib/config";

export async function GET() {
  return NextResponse.json({
    service: "photostudio-platform",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}

const contactSchema = z.object({
  type: z.literal("contact"),
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  message: z.string().min(1).max(5000),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body?.type === "contact") {
      const parsed = contactSchema.parse(body);

      await emailService.send({
        to: config.STUDIO_EMAIL || config.SMTP_USER || "admin@studio.com",
        subject: `New Contact Inquiry`,
        template: "admin-new-booking",
        data: {
          bookingNumber: "CONTACT",
          customerName: parsed.name,
          packageName: `Contact Form Message from ${parsed.email}`,
          sessionDate: new Date().toLocaleDateString(),
          customMessage: parsed.message,
        },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown request type" }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 422 }
      );
    }
    console.error("API POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}