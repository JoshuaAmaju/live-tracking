import { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case "POST":
      console.log(req.body, req.headers, req.query);
      res.status(200).json({});
      break;

    default:
      res.status(405).json({ error: "Method not allowed" });
      break;
  }
}
