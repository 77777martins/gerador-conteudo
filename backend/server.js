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

async function interpretarPedidoImagem(textoUsuario) {
  const resposta = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
You are an expert AI image editing prompt engineer.

The uploaded image contains the real product.

Transform the user request into JSON only.

Return:
{
  "environmentPrompt": "",
  "decorativeElements": "",
  "editInstructions": ""
  styleInstructions": ""
}

Rules:
- The product is always the uploaded image.
- Never tell the image model to create another product.
- Preserve the uploaded product exactly.
- Understand the user's desired background, colors, lighting, mood and objects.
- If the user asks for a logo, symbol, character, mascot or icon, convert it into a clear decorative background element.
- If the user asks for a famous brand logo, describe it as a generic inspired symbol, not an official trademark.
- Keep decorative elements very explicit and positional.
- Return only valid JSON.

Example:
Input:
"fundo preto com símbolo da apple neon no canto superior"

Output:
{
  "environmentPrompt": "dark black premium tech background, glossy surface, cinematic neon lighting, luxury ecommerce atmosphere",
  "decorativeElements": "clearly visible glowing neon apple-shaped symbol in the upper corner, decorative background element only",
  "editInstructions": ""
}

Example:
Input:
"fundo verde com jacaré desenhado no canto superior"

Output:
{
  "environmentPrompt": "vibrant green premium fashion background, sporty clean atmosphere, modern commercial photography",
  "decorativeElements": "clearly visible small crocodile illustration in the upper corner, decorative background element only",
  "editInstructions": ""
}
`
      },
      {
        role: "user",
        content: textoUsuario
      }
    ],
    temperature: 0.4,
    max_tokens: 250
  });

  try {
    return JSON.parse(
      resposta.choices?.[0]?.message?.content || "{}"
    );
  } catch {
    return {
      environmentPrompt: textoUsuario,
      decorativeElements: "",
      editInstructions: ""
    };
  }
}

app.post(
  "/gerar",
  gerarLimiter,
  autenticarUsuario,
  upload.single("imagem"),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const tema = req.body.tema?.trim();
      const pedidoImagem =
  await interpretarPedidoImagem(tema);

const promptCenario =
  pedidoImagem.environmentPrompt || tema;

const elementosDecorativos =
  pedidoImagem.decorativeElements || "";

const instrucoesEdicao =
  pedidoImagem.editInstructions || "";

  console.log("\n====================");
console.log("TEMA ORIGINAL:");
console.log(tema);

console.log("\nPROMPT CENARIO:");
console.log(promptCenario);
console.log("====================\n");

console.log(
  "CENARIO IA:",
  promptCenario
);

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
The uploaded image contains the ONLY real product.

The user may describe the product by mistake.
Ignore product words from the user request.
Use the user request ONLY as the desired environment/background.

USER ENVIRONMENT REQUEST:
"${promptCenario}"

USER ENVIRONMENT REQUEST:
"${promptCenario}"

DECORATIVE BACKGROUND ELEMENTS:
"${elementosDecorativos}"

EDIT INSTRUCTIONS:
"${instrucoesEdicao}"

If decorative elements are requested, they must appear clearly in the background.
Do not place them over the uploaded product.

If the edit instruction conflicts with preserving the product, prioritize preserving the uploaded product.

If removing a hand would damage the product, remove only visible hand areas around the product and keep the product intact.

Do not generate official trademark logos. Generic decorative symbols are allowed when requested.

TASK:

Completely replace the current environment.

The original background must be removed and rebuilt according to the requested scene.

Keep ONLY the uploaded product.

Everything around the product may be reconstructed to match the requested environment.

The final image must look like the product was photographed originally in that environment.

IMPORTANT SCENE RULES:

Follow the user's scene request literally.

If the user requests:
- animals
- drawings
- icons
- decorative symbols
- objects
- scenery elements

they must appear clearly in the generated background.

Decorative elements are allowed in the background.

Do not remove requested background elements.

Never place decorative elements over the product.

The product remains the main subject.

CRITICAL PRODUCT RULES:
- Keep the uploaded product EXACTLY identical
- Do NOT create another product
- Do NOT duplicate the product
- Do NOT redesign the product
- Do NOT change the product shape
- Do NOT change logo
- Do NOT change brand
- Do NOT change colors
- Do NOT change texture
- Do NOT change proportions
- Do NOT change packaging
- Do NOT change visible text on the product

REBUILD:
- background
- environment
- furniture
- surfaces
- scenery
- atmosphere
- lighting
- shadows
- reflections
- depth of field

PRESERVE ONLY:
- the uploaded product

The final result must look like a real professional product photo.

Style:
ultra realistic ecommerce photography,
premium Instagram advertisement,
cinematic lighting,
natural shadows,
realistic reflections,
high-end commercial photo.

IMPORTANT SCENE REQUEST:
Follow the user environment request literally when it describes background colors, animals, drawings, objects, places or decorative elements.

The requested background elements must appear clearly, but only in the background.
`,

          guidance: 6,
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

    let imagemFinalBuffer =
  Buffer.from(
    await imagemFinalResponse.arrayBuffer()
  );

const usuarioPediuMaca =
  tema.toLowerCase().includes("apple") ||
  tema.toLowerCase().includes("aplle") ||
  tema.toLowerCase().includes("maçã") ||
  tema.toLowerCase().includes("maca");

if (usuarioPediuMaca) {
  const simboloMacaSvg = `
    <svg width="120" height="120" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M72 18c-8 3-13 9-14 18 8 1 16-4 20-12 2-4 3-8 2-12-3 1-6 3-8 6z"
        fill="white"
        opacity="0.9"
      />
      <path
        d="M60 38c-11-9-31-4-37 12-8 22 9 52 22 52 7 0 9-4 16-4s9 4 16 4c12 0 27-27 22-45-4-14-17-24-30-19-4 1-6 3-9 3z"
        fill="white"
        opacity="0.9"
      />
    </svg>
  `;

  const simboloBuffer =
    Buffer.from(simboloMacaSvg);

  imagemFinalBuffer =
    await sharp(imagemFinalBuffer)
      .composite([
        {
          input: simboloBuffer,
          top: 40,
          left: 860
        }
      ])
      .png()
      .toBuffer();
}

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

app.get(
  "/historico",
  autenticarUsuario,
  async (req, res) => {
    const { data, error } = await supabase
      .from("post_history")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return res.status(500).json({ error: "Erro ao buscar histórico." });
    }

    return res.json(data);
  }
);

app.post(
  "/historico",
  autenticarUsuario,
  async (req, res) => {
    const { texto, imagem } = req.body;

    if (!texto) {
      return res.status(400).json({ error: "Texto obrigatório." });
    }

    const { error } = await supabase
      .from("post_history")
      .insert({
        user_id: req.user.id,
        texto,
        imagem: imagem || null
      });

    if (error) {
      return res.status(500).json({ error: "Erro ao salvar histórico." });
    }

    return res.json({ success: true });
  }
);

app.delete(
  "/historico",
  autenticarUsuario,
  async (req, res) => {
    const { error } = await supabase
      .from("post_history")
      .delete()
      .eq("user_id", req.user.id);

    if (error) {
      return res.status(500).json({ error: "Erro ao limpar histórico." });
    }

    return res.json({ success: true });
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

        if (
  event.livemode === false &&
  process.env.ALLOW_TEST_PAYMENTS !== "true"
) {
  console.log("Pagamento teste ignorado. PRO não ativado.");
  break;
}

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