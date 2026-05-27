import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import multer from "multer";
import OpenAI from "openai";
import Replicate from "replicate";
import { createClient } from "@supabase/supabase-js";
import rateLimit from "express-rate-limit";
import sharp from "sharp";

dotenv.config();

const app = express();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY
});

const stripe = new Stripe(process.env.STRIPE_KEY);

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const gerarLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: {
    error: "Muitas requisições. Aguarde 1 minuto."
  }
});

const pagamentoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: {
    error: "Muitas tentativas de pagamento."
  }
});

app.use(
  "/webhook",
  express.raw({
    type: "application/json"
  })
);

app.use(cors({
  origin: [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "https://gerador-conteudo-eta.vercel.app"
  ]
}));

app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const formatosPermitidos = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!formatosPermitidos.includes(file.mimetype)) {
      return cb(new Error("Formato de imagem inválido"));
    }

    cb(null, true);
  }
});

async function autenticarUsuario(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: "Usuário não autenticado."
    });
  }

  const token = authHeader.replace("Bearer ", "");

  const {
    data: { user },
    error
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({
      error: "Sessão inválida."
    });
  }

  req.user = user;
  next();
}

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "API SaaS funcionando 🚀"
  });
});

app.post("/criar-perfil", async (req, res) => {
  try {
    const { id, email } = req.body;

    if (!id || !email) {
      return res.status(400).json({
        error: "Dados inválidos."
      });
    }

    const { error } = await supabase
      .from("profiles")
      .upsert({
        id,
        email,
        plan: "free",
        posts_used: 0
      });

    if (error) {
      return res.status(500).json({
        error: error.message
      });
    }

    return res.json({
      success: true
    });
  } catch (err) {
    console.log("ERRO CRIAR PERFIL:", err);

    return res.status(500).json({
      error: "Erro interno."
    });
  }
});

app.get(
  "/perfil",
  autenticarUsuario,
  async (req, res) => {
    try {
      const userId = req.user.id;

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error || !data) {
        return res.status(404).json({
          error: "Perfil não encontrado."
        });
      }

      return res.json(data);
    } catch (err) {
      console.log("ERRO PERFIL:", err);

      return res.status(500).json({
        error: "Erro ao buscar perfil."
      });
    }
  }
);

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function rodarReplicateComRetry(modelo, input, tentativas = 3) {
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      return await replicate.run(modelo, {
        input
      });
    } catch (err) {
      const status = err?.response?.status || err?.status;
      const retryAfter =
        Number(err?.response?.headers?.get?.("retry-after")) || 5;

      if (status === 429 && tentativa < tentativas) {
        console.log(
          `Rate limit Replicate. Tentando novamente em ${retryAfter}s...`
        );

        await esperar(retryAfter * 1000);
        continue;
      }

      throw err;
    }
  }
}

const CONFIG = {
  outputSize: 1024,
  productScale: 0.62,
  shadowOpacity: 0.35,
  shadowBlur: 28,
  shadowOffsetY: 32,
  backgroundBlur: 0.4,
  finalSharpen: true
};


app.post(
  "/gerar",
  gerarLimiter,
  autenticarUsuario,
  upload.single("imagem"),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const tema = req.body.tema?.trim();

      if (!tema) {
        return res.status(400).json({
          error: "Digite um tema para gerar o conteúdo."
        });
      }

      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();

      if (profileError || !profile) {
        return res.status(404).json({
          error: "Perfil não encontrado."
        });
      }

      if (
        profile.plan === "free" &&
        profile.posts_used >= 3
      ) {
        return res.status(403).json({
          error: "Limite grátis atingido."
        });
      }

      let texto = "";
      let imagemGerada = null;
      let descricaoImagem = "";

      console.log("CHECK IMAGEM:");
console.log("Tem arquivo?", !!req.file);
console.log("Plano:", profile.plan);
console.log("USE_FAKE_AI:", process.env.USE_FAKE_AI);

      if (
        req.file &&
        process.env.USE_FAKE_AI !== "true"
      ) {
        try {
          const base64Image =
            req.file.buffer.toString("base64");

          const analiseImagem =
            await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content:
                    "You are a visual marketing analyst. Analyze product images carefully. Reply in English, short and objective."
                },
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: `
Analyze this product image for an advertisement.

Return only:
- Product type
- Visible brand/name/text
- Main colors
- Visual style
- Important product details
- Best Instagram ad direction

Be concise. Do not invent a brand if it is not visible.
`
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url:
                          `data:${req.file.mimetype};base64,${base64Image}`
                      }
                    }
                  ]
                }
              ]
            });

          descricaoImagem =
            analiseImagem
              .choices?.[0]
              ?.message
              ?.content || "";
        } catch (err) {
          console.log("ERRO ANALISAR IMAGEM:", err);
        }
      }

    if (
  req.file &&
  profile.plan === "pro" &&
  process.env.USE_FAKE_AI !== "true"
) {
  try {
    console.log("PIPELINE FLUX KONTEXT NATURAL ✅");

    const imagemBaseBuffer =
      await sharp(req.file.buffer)
        .resize(1024, 1024, {
          fit: "inside",
          withoutEnlargement: true,
          background: {
            r: 255,
            g: 255,
            b: 255,
            alpha: 1
          }
        })
        .png()
        .toBuffer();

    const imagemBase64 =
      `data:image/png;base64,${imagemBaseBuffer.toString("base64")}`;

    const output =
      await rodarReplicateComRetry(
        "black-forest-labs/flux-kontext-pro",
        {
          input_image: imagemBase64,

          prompt: `
Keep the product EXACTLY identical.

Do NOT modify:
- product shape
- logo
- brand
- colors
- texture
- proportions
- label
- packaging
- visible text on the product

Create a realistic premium scene around the original product.

The product must appear naturally placed in the environment with:
- matching shadows
- realistic reflections
- cinematic lighting
- professional advertising photography
- natural depth of field
- realistic perspective

Style:
modern ecommerce product photography,
ultra realistic,
high-end commercial ad,
premium Instagram advertising.

User theme:
${tema}

Very important:
The product must remain the same real product from the uploaded image.
Only improve the scene, lighting, background, shadows and commercial presentation.
`,

          guidance: 3.5,
          aspect_ratio: "match_input_image",
          output_format: "png",
          output_quality: 92
        }
      );

    const imagemFinalRaw =
      Array.isArray(output)
        ? output[0]
        : output;

    const imagemFinalUrl =
      typeof imagemFinalRaw === "string"
        ? imagemFinalRaw
        : imagemFinalRaw?.url
          ? imagemFinalRaw.url()
          : null;

    if (!imagemFinalUrl) {
      throw new Error("A Replicate não retornou URL da imagem.");
    }

    const imagemFinalResponse =
      await fetch(imagemFinalUrl);

    if (!imagemFinalResponse.ok) {
      throw new Error("Erro ao baixar imagem final da Replicate.");
    }

    const imagemFinalBuffer =
      Buffer.from(
        await imagemFinalResponse.arrayBuffer()
      );

    const nomeArquivo =
      `post-${Date.now()}.png`;

    const { error: uploadError } =
      await supabase.storage
        .from("posts")
        .upload(
          nomeArquivo,
          imagemFinalBuffer,
          {
            contentType: "image/png"
          }
        );

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrlData } =
      supabase.storage
        .from("posts")
        .getPublicUrl(nomeArquivo);

    imagemGerada =
      publicUrlData.publicUrl;

    console.log("IMAGEM NATURAL GERADA COM KONTEXT ✅");

  } catch (imgErr) {
    console.log("ERRO IMAGEM IA:");
    console.log(imgErr);
  }
}

      if (process.env.USE_FAKE_AI === "true") {
        texto = `🔥 ${tema}

Destaque seu produto com uma apresentação mais profissional e chamativa.

Peça agora e surpreenda seus clientes.

#marketing #negocios #conteudo`;
      } else {
        const textoResponse =
          await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "You are a senior Brazilian marketing copywriter. Always write the final output in Brazilian Portuguese. Be short, direct, persuasive and ready for Instagram."
              },
              {
                role: "user",
                content: `
Create a short Brazilian Portuguese ad copy for Instagram.

Use this product analysis:
${descricaoImagem || "No image provided."}

User theme:
${tema}

Rules:
- maximum 3 short lines
- mention the product or brand if detected
- make it persuasive
- use one clear call to action
- add 3 hashtags
- no explanation
- return only the final ad text
`
              }
            ],
            temperature: 0.7
          });

        texto =
          textoResponse.choices[0]?.message?.content;
      }

      if (!texto) {
        return res.status(500).json({
          error: "Não foi possível gerar o texto."
        });
      }

      const novoUso =
        profile.posts_used + 1;

      const { error: updateError } =
        await supabase
          .from("profiles")
          .update({
            posts_used: novoUso
          })
          .eq("id", userId);

      if (updateError) {
        console.log("ERRO ATUALIZAR USO:", updateError);

        return res.status(500).json({
          error: "Erro ao atualizar uso."
        });
      }

      return res.json({
        texto,
        imagem: imagemGerada,
        plan: profile.plan,
        remaining:
          profile.plan === "free"
            ? Math.max(3 - novoUso, 0)
            : "∞"
      });
    } catch (err) {
      console.log("ERRO AO GERAR:", err);

      return res.status(500).json({
        error: "Erro ao gerar conteúdo com IA."
      });
    }
  }
);

app.post(
  "/pagamento",
  pagamentoLimiter,
  autenticarUsuario,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const email = req.user.email;

      const session =
        await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "subscription",
          customer_email: email,

          metadata: {
            userId
          },

          subscription_data: {
            metadata: {
              userId
            }
          },

          line_items: [
            {
              price_data: {
                currency: "brl",
                product_data: {
                  name: "Plano PRO - Gerador de Conteúdo"
                },
                unit_amount: 1990,
                recurring: {
                  interval: "month"
                }
              },
              quantity: 1
            }
          ],

          success_url:
            `${process.env.FRONTEND_URL}/index.html?payment=success`,

          cancel_url:
            `${process.env.FRONTEND_URL}/index.html?payment=cancel`
        });

      return res.json({
        url: session.url
      });
    } catch (err) {
      console.log("ERRO STRIPE:", err);

      return res.status(500).json({
        error: "Erro ao criar assinatura."
      });
    }
  }
);

app.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.log("Erro webhook:", err.message);
    return res.sendStatus(400);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        const userId = session.metadata?.userId;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        if (!userId) {
          console.log("Webhook sem userId.");
          break;
        }

        const { data, error } =
          await supabase
            .from("profiles")
            .update({
              plan: "pro",
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId
            })
            .eq("id", userId)
            .select();

        if (error) {
          console.log("ERRO ATIVAR PRO:", error);
        } else if (!data || data.length === 0) {
          console.log("Nenhum perfil encontrado para ativar PRO.");
        } else {
          console.log("🔥 Usuário PRO ativado");
        }

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;

        const subscriptionId = subscription.id;

        const { error } =
          await supabase
            .from("profiles")
            .update({
              plan: "free",
              stripe_subscription_id: null
            })
            .eq("stripe_subscription_id", subscriptionId);

        if (error) {
          console.log("ERRO CANCELAR PRO:", error);
        } else {
          console.log("❌ Assinatura cancelada");
        }

        break;
      }

      default:
        console.log(`Evento: ${event.type}`);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.log("Erro ao processar webhook:", err);
    return res.sendStatus(500);
  }
});

app.get("/sucesso", (req, res) => {
  res.send("🚀 Pagamento aprovado! Pode voltar para o app.");
});

app.get("/erro", (req, res) => {
  res.send("Pagamento falhou. Tente novamente.");
});

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT} 🚀`);
});