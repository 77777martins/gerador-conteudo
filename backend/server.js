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
          console.log("INICIANDO PIPELINE PRODUTO + FUNDO ✅");

          const produtoOriginalBuffer =
            await sharp(req.file.buffer)
              .resize(900, 900, {
                fit: "inside",
                withoutEnlargement: true
              })
              .png()
              .toBuffer();

          const produtoBase64 =
            `data:image/png;base64,${produtoOriginalBuffer.toString("base64")}`;

          const produtoSemFundoOutput =
            await replicate.run(
              "851-labs/background-remover",
              {
                input: {
                  image: produtoBase64
                }
              }
            );

          const produtoSemFundoUrl =
            Array.isArray(produtoSemFundoOutput)
              ? produtoSemFundoOutput[0]
              : produtoSemFundoOutput;

          if (!produtoSemFundoUrl) {
            throw new Error("Não foi possível remover o fundo do produto.");
          }

          console.log("FUNDO DO PRODUTO REMOVIDO ✅");

          const backgroundOutput =
            await replicate.run(
              "black-forest-labs/flux-schnell",
              {
                input: {
                  prompt: `
Create ONLY a premium advertising background for an Instagram product post.

VERY IMPORTANT:
- Do NOT create any product
- Do NOT create bottles
- Do NOT create packages
- Do NOT create logos
- Do NOT create food items
- Background only
- Leave clear space in the center for the real product

Style:
- premium commercial background
- cinematic lighting
- realistic shadows
- clean social media ad design
- attractive marketing scene
- modern Instagram advertising

Theme:
${tema}
`,
                  width: 1024,
                  height: 1024,
                  num_outputs: 1
                }
              }
            );

          const backgroundUrl =
            Array.isArray(backgroundOutput)
              ? backgroundOutput[0]
              : backgroundOutput;

          if (!backgroundUrl) {
            throw new Error("Não foi possível gerar o fundo.");
          }

          console.log("BACKGROUND GERADO ✅");

          const backgroundResponse =
            await fetch(backgroundUrl);

          if (!backgroundResponse.ok) {
            throw new Error("Erro ao baixar o background gerado.");
          }

          const backgroundBuffer =
            Buffer.from(
              await backgroundResponse.arrayBuffer()
            );

          const produtoResponse =
            await fetch(produtoSemFundoUrl);

          if (!produtoResponse.ok) {
            throw new Error("Erro ao baixar produto sem fundo.");
          }

          const produtoSemFundoBuffer =
            Buffer.from(
              await produtoResponse.arrayBuffer()
            );

          const produtoFinalBuffer =
            await sharp(produtoSemFundoBuffer)
              .resize(650, 650, {
                fit: "inside",
                withoutEnlargement: true
              })
              .png()
              .toBuffer();

          const arteFinalBuffer =
            await sharp(backgroundBuffer)
              .resize(1024, 1024)
              .composite([
                {
                  input: produtoFinalBuffer,
                  gravity: "center"
                }
              ])
              .png()
              .toBuffer();

          const nomeArquivo =
            `post-${Date.now()}.png`;

          const { error: uploadError } =
            await supabase.storage
              .from("posts")
              .upload(
                nomeArquivo,
                arteFinalBuffer,
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

          console.log("ARTE FINAL COM PRODUTO ORIGINAL ✅");
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