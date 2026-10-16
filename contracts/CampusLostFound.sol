// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CampusLostFound - lost-and-found board with reward escrow
contract CampusLostFound {
    enum Status { Open, Claimed, Returned, Cancelled }

    struct Item {
        uint256 id;
        address reporter;
        string description;
        string location;
        uint256 reward;      // wei held in escrow
        Status status;
        address finder;
        string proof;
        uint256 reportedAt;
    }

    address public owner;        // admin (deployer)
    uint256 public minReward;    // minimum escrow in wei
    uint256 public itemCount;
    mapping(uint256 => Item) private items;

    event ItemReported(uint256 indexed id, address indexed reporter, uint256 reward);
    event ItemClaimed(uint256 indexed id, address indexed finder);
    event ClaimRejected(uint256 indexed id, address indexed finder);
    event ItemReturned(uint256 indexed id, address indexed finder, uint256 reward);
    event ReportCancelled(uint256 indexed id);
    event MinRewardChanged(uint256 newMinReward);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only admin allowed");
        _;
    }

    modifier itemExists(uint256 id) {
        require(id > 0 && id <= itemCount, "Item does not exist");
        _;
    }

    modifier onlyReporter(uint256 id) {
        require(msg.sender == items[id].reporter, "Only the reporter allowed");
        _;
    }

    constructor(uint256 _minReward) {
        owner = msg.sender;
        minReward = _minReward;
    }

    function reportLost(string calldata description, string calldata location)
        external payable returns (uint256)
    {
        require(bytes(description).length > 0 && bytes(description).length <= 200, "Description must be 1-200 chars");
        require(bytes(location).length > 0, "Location required");
        require(msg.value >= minReward, "Reward below minimum");

        itemCount++;
        items[itemCount] = Item(itemCount, msg.sender, description, location, msg.value,
                                Status.Open, address(0), "", block.timestamp);
        emit ItemReported(itemCount, msg.sender, msg.value);
        return itemCount;
    }

    function claimFound(uint256 id, string calldata proof) external itemExists(id) {
        Item storage it = items[id];
        require(it.status == Status.Open, "Item not open for claims");
        require(msg.sender != it.reporter, "Reporter cannot claim own item");
        require(bytes(proof).length > 0, "Proof note required");

        it.status = Status.Claimed;
        it.finder = msg.sender;
        it.proof = proof;
        emit ItemClaimed(id, msg.sender);
    }

    function confirmReturn(uint256 id) external itemExists(id) onlyReporter(id) {
        Item storage it = items[id];
        require(it.status == Status.Claimed, "No pending claim");

        it.status = Status.Returned;               // effects before interaction
        (bool ok, ) = payable(it.finder).call{value: it.reward}("");
        require(ok, "Reward transfer failed");
        emit ItemReturned(id, it.finder, it.reward);
    }

    function rejectClaim(uint256 id) external itemExists(id) onlyReporter(id) {
        Item storage it = items[id];
        require(it.status == Status.Claimed, "No pending claim");
        address rejected = it.finder;
        it.status = Status.Open;
        it.finder = address(0);
        it.proof = "";
        emit ClaimRejected(id, rejected);
    }

    function cancelReport(uint256 id) external itemExists(id) onlyReporter(id) {
        Item storage it = items[id];
        require(it.status == Status.Open, "Can only cancel open items");
        it.status = Status.Cancelled;
        (bool ok, ) = payable(it.reporter).call{value: it.reward}("");
        require(ok, "Refund failed");
        emit ReportCancelled(id);
    }

    function setMinReward(uint256 _minReward) external onlyOwner {
        minReward = _minReward;
        emit MinRewardChanged(_minReward);
    }

    function getItem(uint256 id) external view itemExists(id) returns (Item memory) {
        return items[id];
    }

    function getAllItems() external view returns (Item[] memory) {
        Item[] memory all = new Item[](itemCount);
        for (uint256 i = 1; i <= itemCount; i++) all[i - 1] = items[i];
        return all;
    }
}
