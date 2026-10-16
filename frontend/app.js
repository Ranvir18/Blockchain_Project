const ABI = [
  "constructor(uint256 _minReward)",
  "function owner() view returns (address)",
  "function minReward() view returns (uint256)",
  "function itemCount() view returns (uint256)",
  "function reportLost(string description, string location) payable returns (uint256)",
  "function claimFound(uint256 id, string proof)",
  "function confirmReturn(uint256 id)",
  "function rejectClaim(uint256 id)",
  "function cancelReport(uint256 id)",
  "function setMinReward(uint256 _minReward)",
  "function getAllItems() view returns (tuple(uint256 id, address reporter, string description, string location, uint256 reward, uint8 status, address finder, string proof, uint256 reportedAt)[])"
];
const STATUS = ["Open", "Claimed", "Returned", "Cancelled"];
let provider, signer, contract, account;
const $ = (id) => document.getElementById(id);

function show(msg, type) {
  const s = $("status");
  s.textContent = msg; s.className = type || ""; s.style.display = "block";
}
function errMsg(e) {
  return e.reason || e.shortMessage || (e.info && e.info.error && e.info.error.message) || e.message;
}

async function connect() {
  if (!window.ethereum) return show("MetaMask not found. Install it first.", "err");
  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    account = await signer.getAddress();
    const net = await provider.getNetwork();
    const bal = await provider.getBalance(account);
    $("walletInfo").textContent = `Account: ${account} | Chain ID: ${net.chainId} | Balance: ${ethers.formatEther(bal)} ETH`;
    show("Wallet connected", "ok");
  } catch (e) { show("Connect failed: " + errMsg(e), "err"); }
}

async function loadContract() {
  try {
    if (!signer) await connect();
    const addr = $("contractAddr").value.trim();
    if (!ethers.isAddress(addr)) return show("Invalid contract address", "err");
    contract = new ethers.Contract(addr, ABI, signer);
    const [owner, minR, count] = await Promise.all([contract.owner(), contract.minReward(), contract.itemCount()]);
    $("contractInfo").textContent = `Admin: ${owner} | Min reward: ${ethers.formatEther(minR)} ETH | Items: ${count}`;
    await refresh();
  } catch (e) { show("Load failed: " + errMsg(e), "err"); }
}

async function send(label, fn) {
  if (!contract) return show("Load the contract first", "err");
  try {
    show(label + " - confirm in MetaMask...");
    const tx = await fn();
    show("Tx sent: " + tx.hash + " (waiting)");
    await tx.wait();
    show("Success! Tx: " + tx.hash, "ok");
    await refresh();
  } catch (e) { show("Failed: " + errMsg(e), "err"); }
}

function report() {
  const reward = $("reward").value;
  if (!reward || Number(reward) <= 0) return show("Enter a positive reward", "err");
  return send("Reporting", () =>
    contract.reportLost($("desc").value, $("loc").value, { value: ethers.parseEther(reward) }));
}

async function refresh() {
  if (!contract) return;
  try {
    const items = await contract.getAllItems();
    const box = $("items"); box.innerHTML = "";
    $("contractInfo").textContent = $("contractInfo").textContent.replace(/Items: \d+/, "Items: " + items.length);
    items.forEach((it) => {
      const st = STATUS[Number(it.status)];
      const div = document.createElement("div"); div.className = "item";
      const info = document.createElement("div");
      info.textContent = `#${it.id} ${it.description} @ ${it.location} | Reward: ${ethers.formatEther(it.reward)} ETH | Reporter: ${it.reporter}`;
      const badge = document.createElement("span"); badge.className = "badge " + st; badge.textContent = st;
      div.append(badge, info);
      if (st === "Claimed") {
        const p = document.createElement("div");
        p.textContent = `Finder: ${it.finder} | Proof: ${it.proof}`; div.append(p);
      }
      const id = it.id;
      const btn = (text, cls, fn) => { const b = document.createElement("button"); b.textContent = text; if (cls) b.className = cls; b.onclick = fn; div.append(b); };
      if (st === "Open") {
        btn("I found it", "", () => {
          const proof = prompt("Proof note (e.g. where you have it, identifying detail):") || "";
          send("Claiming", () => contract.claimFound(id, proof));
        });
        btn("Cancel report", "danger", () => send("Cancelling", () => contract.cancelReport(id)));
      }
      if (st === "Claimed") {
        btn("Confirm return (pay)", "", () => send("Confirming", () => contract.confirmReturn(id)));
        btn("Reject claim", "danger", () => send("Rejecting", () => contract.rejectClaim(id)));
      }
      box.append(div);
    });
  } catch (e) { show("Refresh failed: " + errMsg(e), "err"); }
}

$("connectBtn").onclick = connect;
$("loadBtn").onclick = loadContract;
$("reportBtn").onclick = report;
$("refreshBtn").onclick = refresh;
if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => location.reload());
  window.ethereum.on("chainChanged", () => location.reload());
}
