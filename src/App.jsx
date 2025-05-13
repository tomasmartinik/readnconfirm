// File: src/App.jsx
import React, { useState } from "react";
import axios from "axios";

function App() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmationLink, setConfirmationLink] = useState(null);

  const handleUpload = async () => {
    if (!file) return alert("Nahraj dokument.");
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post("/.netlify/functions/processDocument", formData);
      setConfirmationLink(response.data.pdfUrl);
    } catch (error) {
      alert("Chyba při zpracování.");
      console.error(error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen p-6 bg-gray-100 flex flex-col items-center justify-center">
      <h1 className="text-2xl font-bold mb-4">StandByIt – Potvrzení porozumění</h1>
      <input
        type="file"
        accept=".pdf,.docx,.txt"
        onChange={(e) => setFile(e.target.files[0])}
        className="mb-4"
      />
      <button
        onClick={handleUpload}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
      >
        {loading ? "Zpracovávám..." : "Ověřit porozumění"}
      </button>

      {confirmationLink && (
        <a
          href={confirmationLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 text-green-600 underline"
        >
          📄 Stáhnout potvrzení
        </a>
      )}
    </div>
  );
}

export default App;

// File: netlify/functions/processDocument.js
const { Configuration, OpenAIApi } = require("openai");
const multiparty = require("multiparty");
const fs = require("fs");
const path = require("path");
const pdf = require("pdf-creator-node");
const os = require("os");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

exports.handler = async function (event) {
  const form = new multiparty.Form();

  return new Promise((resolve, reject) => {
    form.parse(event, async (err, fields, files) => {
      if (err) return reject({ statusCode: 500, body: "Error parsing form." });

      const filePath = files.file[0].path;
      const rawText = fs.readFileSync(filePath, "utf-8");

      const gptPrompt = `Shrň hlavní tvrzení z následujícího textu a vytvoř potvrzovací text: \n\n${rawText}`;
      const completion = await openai.createChatCompletion({
        model: "gpt-4o",
        messages: [{ role: "user", content: gptPrompt }],
        temperature: 0.3,
      });

      const responseText = completion.data.choices[0].message.content;
      const outputPath = path.join(os.tmpdir(), `confirmation_${Date.now()}.pdf`);

      const document = {
        html: `
        <html>
        <body>
          <h1>Potvrzení o porozumění</h1>
          <p>${responseText}</p>
          <p style="margin-top:2rem;">🕒 Datum: ${new Date().toLocaleString()}</p>
          <p>🔏 Systémem StandByIt</p>
        </body>
        </html>
        `,
        data: {},
        path: outputPath,
        type: "pdf",
      };

      const options = { format: "A4", orientation: "portrait" };
      await pdf.create(document, options);

      const pdfUrl = `data:application/pdf;base64,${fs.readFileSync(outputPath).toString("base64")}`;

      resolve({
        statusCode: 200,
        body: JSON.stringify({ pdfUrl }),
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      });
    });
  });
};
